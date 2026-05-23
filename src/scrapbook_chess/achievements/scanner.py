"""Achievement scanner: load YAML definitions and evaluate analyzed games."""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg
import yaml

from scrapbook_chess.achievements.metrics import GameMetrics
from scrapbook_chess.database.connection import get_connection
from scrapbook_chess.database.ledger import AchievementLedger

logger = logging.getLogger(__name__)


class AchievementScanner:
    """Loads achievement rules from YAML files and orchestrates scanning.

    Builds game metrics and logs progress/unlocks into the database ledger.
    """

    def __init__(self, username: str, show_all: bool = False) -> None:
        self.username = username
        self.show_all = show_all
        self.ledger = AchievementLedger(username)
        self.configs = self._load_yaml_configs()
        self.sync_definitions()

    def sync_definitions(self) -> None:
        """Synchronize local YAML achievement profiles into the DB catalog."""
        logger.info("🔄 Synchronizing achievement definitions with local YAML files...")

        query = """
            INSERT INTO achievement_definitions (id, type, name, description, config)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                config = EXCLUDED.config;
        """

        count = 0
        with get_connection() as conn, conn.cursor() as cur:
            for item_type, items in self.configs.items():
                for item in items:
                    item_id = item.get("id")
                    if not item_id: continue

                    name = item.get("name") or item_id.replace("badge_", "").replace("_", " ").title()
                    description = item.get("description", "")
                    config_json = json.dumps(item.get("config", {}))

                    cur.execute(query, (item_id, item_type, name, description, config_json))
                    count += 1
            conn.commit()

        logger.info("✨ Synchronized %d definitions into DB registry.", count)

    def _load_yaml_configs(self) -> dict[str, list[dict[str, Any]]]:
        """Reads all achievement configuration files from the local data registry."""
        configs = {"badge": [], "mastery": [], "feat": [], "story": []}
        data_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "achievements"

        if not data_dir.exists():
            return configs

        for filepath in data_dir.glob("*.yml"):
            try:
                with open(filepath, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if not data: continue
                    for item in data:
                        item_type = item.get("type", "unknown")
                        if item_type in configs:
                            configs[item_type].append(item)
            except Exception as e:
                logger.error(f"Failed to parse YAML configuration {filepath.name}: {e}")

        return configs

    def scan_games(self, limit: int | None = None, export_pgn: bool = False) -> None:
        """Fetch ANNOTATED games, generate metrics, and evaluate achievements."""
        import psycopg # Ensure psycopg is imported at the top of your file!
        
        query = "SELECT * FROM master_game_history WHERE pipeline_status = 'ANNOTATED' ORDER BY played_at ASC"
        if limit:
            query += f" LIMIT {limit}"

        with get_connection() as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(query)
            rows = cur.fetchall()

        if not rows:
            logger.info("✨ No annotated games found ready for achievement scanning.")
            return

        logger.info(f"🎯 Found {len(rows)} annotated game(s) to scan.")

        try:
            with get_connection() as write_conn, write_conn.cursor() as write_cur:
                for row in rows:
                    game_id = row["game_id"]
                    try:
                        # 1. Generate Custom Metrics & Fast SQL Columns
                        metrics_engine = GameMetrics(row, self.username)
                        custom_metrics = metrics_engine.export_metrics()
                        fast_cols = metrics_engine.fast_columns

                        # Inject the calculated fast columns back into the dictionary 
                        # so _evaluate_feats and _evaluate_mastery can read them!
                        row.update(fast_cols)

                        # 2. Evaluate rules against the flat row + custom metrics
                        self._evaluate_badges(row, custom_metrics)
                        self._evaluate_mastery(row)
                        self._evaluate_feats(row)

                        # 3. Handle professional physical file exports
                        if export_pgn and row.get("annotated_pgn"):
                            self._export_annotated_pgn(row, row["annotated_pgn"])

                        # 4. Save metrics AND fast columns, mark SCANNED
                        update_sql = """
                            UPDATE games 
                            SET metrics = %s,
                                blunders_count = %s,
                                mistakes_count = %s,
                                inaccuracies_count = %s,
                                book_moves_count = %s,
                                acpl = %s,
                                pipeline_status = 'SCANNED' 
                            WHERE id = %s
                        """
                        write_cur.execute(update_sql, (
                            json.dumps(custom_metrics),
                            fast_cols["blunders_count"],
                            fast_cols["mistakes_count"],
                            fast_cols["inaccuracies_count"],
                            fast_cols["book_moves_count"],
                            fast_cols["acpl"],
                            game_id
                        ))
                        write_conn.commit()

                    except Exception as game_err:
                        # The trace will point exactly to the broken line if you run with --debug
                        logger.error("❌ Failed processing achievement scans for game %s: %s", game_id, game_err, exc_info=True)
                        write_conn.rollback()
                        continue
                        
        except Exception as batch_err:
             logger.error("💥 Scanner batch processing critical failure: %s", batch_err)

    def _evaluate_badges(self, row: dict[str, Any], custom_metrics: dict[str, Any]) -> None:
        for badge in self.configs.get("badge", []):
            badge_id = badge["id"]
            config = badge.get("config", {})
            metric_key = config.get("metric_key")
            required_value = config.get("required_value")

            # If no key, default behavior (skip or count)
            if not metric_key:
                self.ledger.record_progress(row["game_id"], badge_id, 1.0)
                continue

            # STRICT CHECK: If the key isn't in our metrics, don't guess!
            if metric_key not in custom_metrics:
                logger.debug(f"Skipping badge {badge_id}: metric '{metric_key}' not found.")
                continue

            actual_value = custom_metrics[metric_key]

            if actual_value == required_value:
                self.ledger.record_progress(row["game_id"], badge_id, 1.0)

    def _evaluate_mastery(self, row: dict[str, Any]) -> None:
        """Calculates specific openings and updates experience points pools."""
        is_white = row["white_username"] == self.username
        my_color_name = "white" if is_white else "black"
        is_win = (is_white and row["score"] == "1-0") or (not is_white and row["score"] == "0-1")

        for mastery in self.configs.get("mastery", []):
            conditions = mastery.get("config", {}).get("conditions", {})
            
            color_req = conditions.get("color", "any")
            if color_req != "any" and color_req != my_color_name:
                continue

            opening_eco = row.get("opening_eco") or ""
            opening_name = row.get("opening_name") or ""

            matched_eco = any(opening_eco.startswith(pref) for pref in conditions.get("eco_prefixes", []))
            matched_name = any(word.lower() in opening_name.lower() for word in conditions.get("name_includes", []))

            if matched_eco or matched_name:
                base_exp = 50.0 if is_win else 10.0
                if row.get("blunders_count", 0) == 0:
                    base_exp += 25.0
                self.ledger.record_progress(row["game_id"], mastery["id"], base_exp)

    def _evaluate_feats(self, row: dict[str, Any]) -> None:
        """Validates situational unique performance triggers."""
        is_white = row["white_username"] == self.username
        is_win = (is_white and row["score"] == "1-0") or (not is_white and row["score"] == "0-1")

        for feat in self.configs.get("feat", []):
            feat_id = feat["id"]
            if (
                feat_id == "feat_clean_sheet"
                and row.get("blunders_count", 0) == 0
                and row.get("mistakes_count", 0) == 0
                and is_win
            ):
                self.ledger.record_progress(row["game_id"], feat_id, 1.0)

    def _export_annotated_pgn(self, row: dict[str, Any], pgn_content: str) -> None:
        """Save annotated PGN content to disk for debugging or export."""
        output_dir = Path("debug/pgn_files")
        output_dir.mkdir(parents=True, exist_ok=True)

        date_str = row["played_at"].strftime("%Y-%m-%d")
        white = row["white_username"]
        black = row["black_username"]

        safe_opening = re.sub(r'[\\/*?:"<>|]', "", row.get("opening_name", "Unknown"))
        filename = f"{date_str} - {white} vs {black} - {safe_opening}.pgn"
        file_path = output_dir / filename

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(pgn_content)

        logger.debug(f"📄 Exported annotated PGN trail: {filename}")


# =====================================================================
# FUNCTIONAL WRAPPER FOR ORCHESTRATOR
# =====================================================================

def process_achievements(
    username: str,
    limit: int | None = None,
    show_all: bool = False,
    export_pgn: bool = False,
) -> None:
    scanner = AchievementScanner(username, show_all)
    scanner.scan_games(limit, export_pgn)
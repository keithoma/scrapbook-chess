import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from scrapbook_chess.achievements.metrics import GameMetrics
from scrapbook_chess.analysis.annotation_service import GameAnnotator
from scrapbook_chess.database.connection import get_connection
from scrapbook_chess.database.ledger import AchievementLedger

logger = logging.getLogger(__name__)


class AchievementScanner:
    """
    Loads achievement rules from YAML files, orchestrates move annotation,
    builds game metrics, and logs progress/unlocks into the database ledger.
    """

    def __init__(self, username: str, show_all: bool = False):
        self.username = username
        self.show_all = show_all
        self.ledger = AchievementLedger(username)
        self.configs = self._load_yaml_configs()

        # Automatically sync YAML files into the database definitions table on boot!
        self.sync_definitions()

    def sync_definitions(self) -> None:
        """Synchronizes all loaded YAML achievement profiles into the database definitions catalog."""
        logger.info(
            "🔄 Synchronizing achievement definitions catalog with local YAML files..."
        )

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
        with get_connection() as conn:
            with conn.cursor() as cur:
                for item_type, items in self.configs.items():
                    for item in items:
                        item_id = item.get("id")
                        if not item_id:
                            continue

                        name = (
                            item.get("name")
                            or item_id.replace("badge_", "")
                            .replace("_", " ")
                            .title()
                        )
                        description = item.get("description", "")

                        # Use json.dumps so PostgreSQL receives clean, native JSON strings!
                        config_json = json.dumps(item.get("config", {}))

                        cur.execute(
                            query,
                            (
                                item_id,
                                item_type,
                                name,
                                description,
                                config_json,
                            ),
                        )
                        count += 1
            conn.commit()

        logger.info(
            f"✨ Successfully synchronized {count} definitions into the database registry."
        )

    def _load_yaml_configs(self) -> Dict[str, List[Dict[str, Any]]]:
        """Reads all achievement configuration files from the local data registry."""
        configs = {"badge": [], "mastery": [], "feat": [], "story": []}
        data_dir = (
            Path(__file__).resolve().parent.parent.parent
            / "data"
            / "achievements"
        )

        if not data_dir.exists():
            logger.warning(
                f"Achievement directory not found at {data_dir}. Scanning skipped."
            )
            return configs

        for filepath in data_dir.glob("*.yml"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if not data:
                        continue

                    for item in data:
                        item_type = item.get("type", "unknown")
                        if item_type in configs:
                            configs[item_type].append(item)
            except Exception as e:
                logger.error(
                    f"Failed to parse YAML configuration {filepath.name}: {e}"
                )

        return configs

    def scan_games(
        self, limit: Optional[int] = None, export_pgn: bool = False
    ) -> None:
        """Fetches engine-analyzed games and pushes them through the evaluation pipeline."""

        # Target games where Stockfish analysis has successfully finished
        query = """
            SELECT id, game_data 
            FROM games 
            WHERE game_data->>'local_analysis_complete' = 'true'
            ORDER BY played_at DESC
        """
        if limit:
            query += f" LIMIT {limit}"

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()

        if not rows:
            logger.info(
                "✨ No analyzed games found ready for achievement scanning."
            )
            return

        logger.info(f"🎯 Found {len(rows)} analyzed game(s) to scan.")

        # Initialize the annotator once to handle book lookups across the whole batch safely
        with GameAnnotator() as annotator:
            for game_id, game_data_raw in rows:
                try:
                    # Failsafe parsing if the adapter layer returns strings
                    game_data = (
                        game_data_raw
                        if isinstance(game_data_raw, dict)
                        else yaml.safe_load(game_data_raw)
                    )

                    move_evals = game_data.get("move_evals", [])
                    moves_string = game_data.get("moves", "")

                    # 1. Generate live classifications and a compiled PGN string
                    annotated_plies, final_pgn = annotator.annotate_game_moves(
                        moves_string, move_evals
                    )

                    # 2. Extract metrics profile
                    metrics = GameMetrics(
                        game_id=game_id,
                        game_data=game_data,
                        annotated_plies=annotated_plies,
                        move_evals=move_evals,
                        username=self.username,
                    )

                    # 3. Evaluate rules engines
                    self._evaluate_badges(metrics)
                    self._evaluate_mastery(metrics)
                    self._evaluate_feats(metrics)

                    # 4. Handle professional physical file exports if flag is present
                    if export_pgn and final_pgn:
                        self._export_annotated_pgn(game_data, final_pgn)

                except Exception as e:
                    logger.error(
                        f"❌ Failed processing achievement scans for game {game_id}: {e}"
                    )

    def _evaluate_badges(self, metrics: GameMetrics) -> None:
        """Evaluates ongoing metric thresholds (e.g., total games won, total rapid matches)."""
        for badge in self.configs.get("badge", []):
            badge_id = badge["id"]
            config = badge.get("config", {})

            metric_key = config.get("metric_key")
            required_value = config.get("required_value")

            # If no key is provided, treat it as a flat "games played" tally tracker
            if not metric_key:
                self.ledger.record_progress(metrics.game_id, badge_id, 1.0)
                continue

            # Check if the property exists on our metrics profile
            if hasattr(metrics, metric_key):
                actual_value = getattr(metrics, metric_key)

                # Match exact values or boolean truth flags cleanly
                if actual_value == required_value:
                    self.ledger.record_progress(metrics.game_id, badge_id, 1.0)

    def _evaluate_mastery(self, metrics: GameMetrics) -> None:
        """Calculates specific openings and updates experience points pools."""
        for mastery in self.configs.get("mastery", []):
            conditions = mastery.get("config", {}).get("conditions", {})

            # Validate structural color requirements
            color_req = conditions.get("color", "any")
            if color_req != "any" and color_req != metrics.my_color_name:
                continue

            # Match on ECO codes or specific opening titles
            matched_eco = any(
                metrics.opening_eco.startswith(pref)
                for pref in conditions.get("eco_prefixes", [])
            )
            matched_name = any(
                word.lower() in metrics.opening_name.lower()
                for word in conditions.get("name_includes", [])
            )

            if matched_eco or matched_name:
                # Award performance scaling scale: Win gets 50 EXP, Loss/Draw gets 10 EXP
                base_exp = 50.0 if metrics.is_win else 10.0
                if metrics.blunders == 0:
                    base_exp += 25.0  # Precision bonus allocation

                self.ledger.record_progress(
                    metrics.game_id, mastery["id"], base_exp
                )

    def _evaluate_feats(self, metrics: GameMetrics) -> None:
        """Validates situational unique performance triggers."""
        for feat in self.configs.get("feat", []):
            feat_id = feat["id"]

            # Example dynamic assignment map matching your clean metrics variables
            if (
                feat_id == "feat_clean_sheet"
                and metrics.blunders == 0
                and metrics.mistakes == 0
            ):
                if metrics.is_win:
                    self.ledger.record_progress(metrics.game_id, feat_id, 1.0)

    def _export_annotated_pgn(
        self, game_data: Dict[str, Any], pgn_content: str
    ) -> None:
        """Saves fully annotated PGN maps containing real move analysis commentary directly to disk."""
        output_dir = Path("debug/pgn_files")
        output_dir.mkdir(parents=True, exist_ok=True)

        played_timestamp = game_data.get("timestamp", 0)
        date_str = datetime.fromtimestamp(played_timestamp).strftime("%Y-%m-%d")

        def extract_player_name(color: str) -> str:
            player = game_data.get("players", {}).get(color, {})
            return player.get("name") or "Unknown"

        white = extract_player_name("white")
        black = extract_player_name("black")

        # Clean file names of operating system forbidden characters
        opening_title = (
            game_data.get("raw_api_response", {})
            .get("opening", {})
            .get("name", "Unknown")
        )
        safe_opening = re.sub(r'[\\/*?:"<>|]', "", opening_title)

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
    limit: Optional[int] = None,
    show_all: bool = False,
    export_pgn: bool = False,
) -> None:
    """Orchestrator entry point execution hook."""
    scanner = AchievementScanner(username, show_all)
    scanner.scan_games(limit, export_pgn)

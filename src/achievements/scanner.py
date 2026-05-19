"""
Achievement Scanner Orchestrator.

Scans analyzed games, calculates metrics, and evaluates them against
the YAML achievement rules using the AchievementLedger.
"""

import re
import logging
import yaml
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

from src.database.connection import get_connection
from src.database.ledger import AchievementLedger
from src.achievements.metrics import GameMetrics

logger = logging.getLogger(__name__)


class AchievementScanner:
    def __init__(self, username: str, show_all: bool = False):
        self.username = username
        self.show_all = show_all
        self.ledger = AchievementLedger(username)
        self.configs = self._load_configs()

    def _load_configs(self) -> Dict[str, List[Dict[str, Any]]]:
        """Loads the YAML rule dictionaries into memory."""
        configs = {"badge": [], "mastery": [], "feat": [], "story": []}
        data_dir = (
            Path(__file__).resolve().parent.parent.parent
            / "data"
            / "achievements"
        )

        # Now scanning for .yml files instead of .json
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
                logger.error("Failed to load %s: %s", filepath.name, e)

        return configs

    def scan_games(self, limit: int = None, export_pgn: bool = False):
        """Fetches analyzed games and pushes them through the evaluation pipeline."""
        logger.info("🏆 Scanning games for %s...", self.username)

        query = """
            SELECT id, score, speed, game_data 
            FROM games 
            WHERE (
                LOWER(COALESCE(
                    game_data#>>'{players,white,user,id}', 
                    game_data#>>'{players,white,id}'
                )) = %s 
                OR 
                LOWER(COALESCE(
                    game_data#>>'{players,black,user,id}', 
                    game_data#>>'{players,black,id}'
                )) = %s
            )
            AND game_data->>'analysis_results' IS NOT NULL
            ORDER BY played_at DESC
        """
        if limit:
            query += f" LIMIT {limit}"

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query, (self.username.lower(), self.username.lower())
                )
                rows = cur.fetchall()

        if not rows:
            logger.error("❌ No analyzed games found for %s.", self.username)
            return

        logger.info("🎯 Found %d games to scan!", len(rows))

        for game_id, score, speed, game_data in rows:
            # We assume the Engine Analyzer injected 'analysis_results' into the game_data JSONB
            analysis_results = game_data.get("analysis_results", [])

            # Updated signature based on our new metrics.py
            metrics = GameMetrics(
                game_id, game_data, analysis_results, self.username
            )

            self._evaluate_badges(metrics)
            self._evaluate_mastery(metrics)
            self._evaluate_feats(metrics)

            if export_pgn:
                self._export_annotated_pgn(game_data)

    def _evaluate_badges(self, metrics: GameMetrics):
        """
        Dynamically evaluates badges based on YAML config.
        Expects YAML to have config -> { metric_key: 'is_win', required_value: True }
        """
        for badge in self.configs.get("badge", []):
            badge_id = badge["id"]
            config = badge.get("config", {})

            # Default to tracking a flat '+1' if no specific metric key is provided
            metric_key = config.get("metric_key")
            required_value = config.get("required_value")

            progress_amount = 0

            if not metric_key:
                # If it's just a "games played" badge
                progress_amount = 1
            else:
                # Dynamically check the GameMetrics object
                actual_value = getattr(metrics, metric_key, None)

                # If the metric matches the required condition (e.g., speed == "blitz")
                if actual_value == required_value:
                    progress_amount = 1
                # Or if the metric is a boolean flag (e.g., is_win == True)
                elif (
                    isinstance(required_value, bool)
                    and actual_value is required_value
                ):
                    progress_amount = 1

            if progress_amount > 0:
                self.ledger.record_progress(
                    metrics.game_id, badge_id, progress_amount
                )

    def _evaluate_mastery(self, metrics: GameMetrics):
        """Matches ECO codes and awards EXP for opening mastery."""
        for mastery_item in self.configs.get("mastery", []):
            cond = mastery_item.get("config", {}).get("conditions", {})

            color_req = cond.get("color", "any")
            if color_req != "any" and color_req != getattr(
                metrics, "my_color_name", "any"
            ):
                continue

            matched_eco = any(
                metrics.opening_eco.startswith(p)
                for p in cond.get("eco_prefixes", [])
            )
            matched_name = any(
                n.lower() in metrics.opening_name.lower()
                for n in cond.get("name_includes", [])
            )

            if matched_eco or matched_name:
                exp = 50 if metrics.is_win else 10
                if metrics.blunders == 0:
                    exp += 25

                self.ledger.record_progress(
                    metrics.game_id, mastery_item["id"], exp
                )

    def _evaluate_feats(self, metrics: GameMetrics):
        """Checks for situational occurrences (Feats)."""
        # Feats will heavily rely on the metrics calculated from the engine
        for feat in self.configs.get("feat", []):
            feat_id = feat["id"]
            config = feat.get("config", {})

            # Example logic placeholder to be driven by YAML
            if (
                feat_id == "feat_clean_sheet"
                and metrics.blunders == 0
                and metrics.mistakes == 0
            ):
                self.ledger.record_progress(metrics.game_id, feat_id, 1)

    def _export_annotated_pgn(self, game_data: Dict[str, Any]):
        """Saves amended PGN with robust name and opening detection."""
        output_dir = Path("debug/pgn_files")
        output_dir.mkdir(parents=True, exist_ok=True)

        # Assuming the Analyzer stored the amended PGN back into game_data
        annotated_content = game_data.get("amended_pgn")
        if not annotated_content:
            return

        ts = game_data.get("timestamp", 0)
        date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")

        def get_name(color):
            p = game_data.get("players", {}).get(color, {})
            return p.get("user", {}).get("name") or p.get("name") or "Unknown"

        white = get_name("white")
        black = get_name("black")

        opening_data = game_data.get("raw_api_response", {}).get("opening", {})
        opening_name = (
            opening_data.get("name", "Unknown Opening")
            if isinstance(opening_data, dict)
            else "Unknown"
        )
        safe_opening = re.sub(r'[\\/*?:"<>|]', "", opening_name)

        filename = f"{date_str} - {white} vs {black} - {safe_opening}.pgn"
        file_path = output_dir / filename

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(annotated_content)

        logger.info("  📄 Exported: %s", filename)


def process_achievements(
    username: str,
    limit: int = None,
    show_all: bool = False,
    export_pgn: bool = False,
):
    scanner = AchievementScanner(username, show_all)
    scanner.scan_games(limit, export_pgn)

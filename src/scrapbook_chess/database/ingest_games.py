"""
Lichess Data Ingestion Module.

This module handles fetching games from the Lichess NDJSON API,
parsing them into a structured format (including board event extraction),
and storing them in the PostgreSQL database.
"""

import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

import requests
import chess
from tqdm import tqdm

from scrapbook_chess.database.connection import get_connection
from scrapbook_chess.config import DATABASE_URL

logger = logging.getLogger(__name__)

# Constants
START = datetime(2026, 5, 22, tzinfo=timezone.utc)


class LichessIngestor:
    """
    Handles the lifecycle of game ingestion from Lichess to the local DB.
    """

    def __init__(self, username: str, token: Optional[str] = None):
        self.username = username
        self.headers = {"Accept": "application/x-ndjson"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    def fetch_and_store(self, limit: int = 50) -> int:
        """
        Main entry point: fetches, parses, and saves games.
        """
        url = f"https://lichess.org/api/games/user/{self.username}"
        params = {
            "max": limit,
            "perfType": "ultraBullet,bullet,blitz,rapid,classical",
            "moves": "true",
            "opening": "true",
            "clocks": "true",
            "evals": "false",
        }

        count = 0
        logger.info(
            "📡 Fetching games for %s (Since May 1st)...", self.username
        )

        try:
            with requests.get(
                url, params=params, headers=self.headers, stream=True
            ) as response:
                response.raise_for_status()

                # Using tqdm for a nice progress bar on the stream
                for line in tqdm(
                    response.iter_lines(), desc="Ingesting", unit="game"
                ):
                    if not line:
                        continue

                    raw_game = json.loads(line)
                    if self._should_skip(raw_game):
                        continue

                    # Process and Save
                    clean_game = self._format_game_data(raw_game)
                    if self._save_to_db(clean_game):
                        count += 1

        except requests.RequestException as e:
            logger.error("Failed to fetch games from Lichess: %s", e)

        logger.info("🏁 Ingestion complete. %d new games stored.", count)
        return count

    def _should_skip(self, raw_game: Dict[str, Any]) -> bool:
        """Determines if a game should be ignored (date cutoff or invalid)."""
        created_at = raw_game.get("createdAt")
        if not created_at:
            return True

        game_time = datetime.fromtimestamp(created_at / 1000, tz=timezone.utc)
        if game_time < START:
            return True

        # Skip variants (InitialFen present) or very short games
        if (
            "initialFen" in raw_game
            or len(raw_game.get("moves", "").split()) < 4
        ):
            return True

        return False

    def _format_game_data(self, raw_game: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parses raw API data into a structured internal schema.
        Now simplified to exclude board events, which are handled in the Metrics stage.
        """
        raw_moves = raw_game.get("moves", "")

        return {
            "id": raw_game.get("id"),
            "platform": "lichess",
            "timestamp": raw_game.get("createdAt", 0) // 1000,
            "is_rated": raw_game.get("rated", False),
            "speed": raw_game.get("speed", "unknown"),
            "players": {
                "white": self._parse_player(
                    raw_game.get("players", {}).get("white", {})
                ),
                "black": self._parse_player(
                    raw_game.get("players", {}).get("black", {})
                ),
            },
            "score": self._get_score(raw_game.get("winner")),
            "moves": raw_moves,
            # We store the raw response so the Analyzer/Metrics can pull what they need later
            "raw_api_response": raw_game,
        }

    def _save_to_db(self, game_data: Dict[str, Any]) -> bool:
        """Inserts game into PostgreSQL using a safe transaction."""
        query = """
            INSERT INTO games (id, platform, played_at, rated, speed, score, game_data)
            VALUES (%s, %s, to_timestamp(%s), %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        query,
                        (
                            game_data["id"],
                            game_data["platform"],
                            game_data["timestamp"],
                            game_data["is_rated"],
                            game_data["speed"],
                            game_data["score"],
                            json.dumps(game_data),
                        ),
                    )
                    return cur.rowcount > 0
        except Exception as e:
            logger.error("DB Error on game %s: %s", game_data["id"], e)
            return False

    @staticmethod
    def _parse_player(data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles AI vs Human player data normalization."""
        if "aiLevel" in data:
            return {
                "id": f"bot_{data['aiLevel']}",
                "name": "Stockfish",
                "rating": 0,
            }

        user = data.get("user", {})
        return {
            "id": user.get("id", "unknown"),
            "name": user.get("name", "Unknown"),
            "rating": data.get("rating", 1500),
        }

    @staticmethod
    def _get_score(winner: Optional[str]) -> str:
        if winner == "white":
            return "1-0"
        if winner == "black":
            return "0-1"
        return "1/2-1/2"


def fetch_and_store_games(username: str, limit: int = 50):
    """Functional wrapper for the orchestrator."""
    ingestor = LichessIngestor(username)
    ingestor.fetch_and_store(limit)

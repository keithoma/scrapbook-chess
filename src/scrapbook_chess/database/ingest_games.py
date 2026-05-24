"""Lichess Data Ingestion Module.

This module handles fetching games from the Lichess NDJSON API,
parsing them into a structured flat format, and storing them in the PostgreSQL database.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

import requests
from tqdm import tqdm

from scrapbook_chess.database.connection import get_connection

logger = logging.getLogger(__name__)

# Constants
START = datetime(2026, 5, 22, tzinfo=UTC)


class LichessIngestor:
    """Handles the lifecycle of game ingestion from Lichess to the local DB."""

    def __init__(self, username: str, token: str | None = None) -> None:
        """Initialize the Lichess ingestor with optional API token."""
        self.username = username
        self.headers = {"Accept": "application/x-ndjson"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    def fetch_and_store(self, limit: int = 50) -> int:
        """Main entry point: fetches, parses, and saves games."""
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
        logger.info("📡 Fetching games for %s (Since May 1st)...", self.username)

        try:
            with requests.get(
                url, params=params, headers=self.headers, stream=True, timeout=30
            ) as response:
                response.raise_for_status()

                for line in tqdm(response.iter_lines(), desc="Ingesting", unit="game"):
                    if not line:
                        continue

                    raw_game = json.loads(line)
                    if self._should_skip(raw_game):
                        continue

                    clean_game = self._format_game_data(raw_game)
                    if self._save_to_db(clean_game):
                        count += 1

        except requests.RequestException as e:
            logger.error("Failed to fetch games from Lichess: %s", e)

        logger.info("🏁 Ingestion complete. %d new games stored.", count)
        return count

    def _should_skip(self, raw_game: dict[str, Any]) -> bool:
        """Determines if a game should be ignored (date cutoff or invalid)."""
        created_at = raw_game.get("createdAt")
        if not created_at:
            return True

        game_time = datetime.fromtimestamp(created_at / 1000, tz=UTC)
        if game_time < START:
            return True

        return "initialFen" in raw_game or len(raw_game.get("moves", "").split()) < 4

    def _format_game_data(self, raw_game: dict[str, Any]) -> dict[str, Any]:
        """Parses raw API data into our new flat database schema."""
        white_player = self._parse_player(raw_game.get("players", {}).get("white", {}))
        black_player = self._parse_player(raw_game.get("players", {}).get("black", {}))
        opening = raw_game.get("opening", {})

        return {
            "id": raw_game.get("id"),
            "platform": "lichess",
            "played_at": raw_game.get("createdAt", 0) // 1000,
            "time_control": raw_game.get("speed", "unknown"),
            "is_rated": raw_game.get("rated", False),
            "score": self._get_score(raw_game.get("winner")),
            "termination_status": raw_game.get("status", "unknown"),
            "opening_name": opening.get("name"),
            "opening_eco": opening.get("eco"),
            "white_username": white_player["id"],
            "white_rating": white_player["rating"],
            "white_rating_diff": white_player["rating_diff"],
            "black_username": black_player["id"],
            "black_rating": black_player["rating"],
            "black_rating_diff": black_player["rating_diff"],
            "raw_moves": raw_game.get("moves", ""),
            "clocks": raw_game.get("clocks", []),
        }

    def _save_to_db(self, game: dict[str, Any]) -> bool:
        """Inserts game into PostgreSQL matching the flat schema."""
        # Define the query as a single static string
        query = """
            INSERT INTO games (
                id, platform, played_at, time_control, is_rated, score, 
                termination_status, opening_name, opening_eco, white_username, 
                white_rating, white_rating_diff, black_username, black_rating, 
                black_rating_diff, raw_moves, clocks
            ) VALUES (
                %(id)s, %(platform)s, to_timestamp(%(played_at)s), %(time_control)s, 
                %(is_rated)s, %(score)s, %(termination_status)s, %(opening_name)s, 
                %(opening_eco)s, %(white_username)s, %(white_rating)s, 
                %(white_rating_diff)s, %(black_username)s, %(black_rating)s, 
                %(black_rating_diff)s, %(raw_moves)s, %(clocks)s
            ) ON CONFLICT (id) DO NOTHING;
        """
        try:
            with get_connection() as conn, conn.cursor() as cur:
                # psycopg handles dict parameter mapping perfectly via %(key)s
                cur.execute(query, game)
                return cur.rowcount > 0
        except Exception as e:
            logger.error("DB Error on game %s: %s", game["id"], e)
            return False

    @staticmethod
    def _parse_player(data: dict[str, Any]) -> dict[str, Any]:
        """Handles AI vs Human player data normalization, including rating diffs."""
        if "aiLevel" in data:
            return {
                "id": f"bot_{data['aiLevel']}",
                "name": "Stockfish",
                "rating": 0,
                "rating_diff": 0,
            }

        user = data.get("user", {})
        return {
            "id": user.get("id", "unknown").lower(),  # Lowercase for clean querying
            "name": user.get("name", "Unknown"),
            "rating": data.get("rating", 1500),
            "rating_diff": data.get("ratingDiff"),  # Might be None, SQL handles it!
        }

    @staticmethod
    def _get_score(winner: str | None) -> str:
        if winner == "white":
            return "1-0"
        if winner == "black":
            return "0-1"
        return "1/2-1/2"


def fetch_and_store_games(username: str, limit: int = 50) -> None:
    """Functional wrapper for the orchestrator."""
    ingestor = LichessIngestor(username)
    ingestor.fetch_and_store(limit)

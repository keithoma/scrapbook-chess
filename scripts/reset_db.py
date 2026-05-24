"""Utility script to purge the local development database.

Example:
    $ uv run scripts/reset_db.py
"""

import argparse
import logging
import sys

from scrapbook_chess.database.connection import get_connection

# set up a logger
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def reset_database(force: bool = False) -> None:
    """Safely purges all user, game, and achievement progress tables.

    Args:
        force (bool): Flag to skip the yes/no-confirmation.
    """
    if not force:
        user_input = input(
            "⚠️  WARNING: This will wipe ALL games, users, and progress. "
            "Proceed? [y/N]: "
        )
        if user_input.lower() not in ("y", "yes"):
            logger.info("❌ Database reset aborted.")
            sys.exit(0)

    logger.info("🧹 Wiping database tables via cascading truncate...")

    query = """
        DROP VIEW IF EXISTS master_game_history CASCADE;
        DROP TABLE IF EXISTS game_grants_ledger CASCADE;
        DROP TABLE IF EXISTS user_unlocks CASCADE;
        DROP TABLE IF EXISTS user_progress CASCADE;
        DROP TABLE IF EXISTS games CASCADE;
        DROP TABLE IF EXISTS achievement_definitions CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
        conn.commit()
    logger.info("✨ Database is completely empty. Clean slate achieved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Database Purge Utility")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip the interactive confirmation prompt (useful for automation scripts)",
    )
    args = parser.parse_args()

    reset_database(force=args.force)

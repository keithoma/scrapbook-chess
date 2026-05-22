import sys
from pathlib import Path

# Fix pythonpath resolution before importing from src
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

import argparse
import logging

from scrapbook_chess.database.connection import get_connection

# Configure clean console feedback
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def reset_database(force: bool = False) -> None:
    """Safely purges all user, game, and achievement progress tables."""

    if not force:
        # Safety Interlock: Require explicit human verification
        user_input = input(
            "⚠️  WARNING: This will wipe ALL games, users, and progress. Proceed? [y/N]: "
        )
        if user_input.lower() not in ("y", "yes"):
            logger.info("❌ Database reset aborted.")
            sys.exit(0)

    logger.info("🧹 Wiping database tables via cascading truncate...")

    query = "TRUNCATE games, users, game_grants_ledger, user_progress, user_unlocks CASCADE;"

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
            conn.commit()
        logger.info("✨ Database is completely empty. Clean slate achieved.")
    except Exception as e:
        logger.error(f"❌ Failed to reset database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Database Purge Utility")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip the interactive confirmation prompt (useful for automation scripts)",
    )
    args = parser.parse_args()

    reset_database(force=args.force)

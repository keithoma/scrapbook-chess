import logging

from scrapbook_chess.achievements.scanner import process_achievements
from scrapbook_chess.analysis.engine_service import run_engine_analysis
from scrapbook_chess.database.ingest_games import fetch_and_store_games
from scrapbook_chess.database.initialize import initialize_database

logger = logging.getLogger(__name__)


def run_pipeline(args):
    """
    Executes the Chess Achievement Book workflow.
    """
    # 0. Infrastructure
    initialize_database()

    # 1. Ingestion
    if not args.skip_fetch:
        logger.info("📥 Fetching games for %s", args.user)
        fetch_and_store_games(username=args.user, limit=args.limit)

    # 2. Engine Analysis
    if not args.skip_analysis:
        # We wrap the logic here if we want a high-level progress bar,
        # but typically we'll put the tqdm inside analyze_pending_games.
        logger.info("🧠 Commencing Stockfish Deep Analysis...")
        run_engine_analysis(limit=args.limit)

    # 3. Achievement Scanning
    logger.info("🏆 Scanning for achievements...")
    process_achievements(
        username=args.user,
        limit=args.limit,
        show_all=args.show_achievements,
        export_pgn=args.export_pgn,
    )

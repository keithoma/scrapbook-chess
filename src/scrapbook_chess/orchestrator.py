"""Orchestrates the main workflow."""

import argparse
import logging

from scrapbook_chess.achievements.scanner import process_achievements
from scrapbook_chess.analysis.annotation_service import run_annotation_batch
from scrapbook_chess.analysis.engine_service import run_engine_analysis
from scrapbook_chess.database.ingest_games import fetch_and_store_games
from scrapbook_chess.database.initialize import initialize_database

logger = logging.getLogger(__name__)


def run_pipeline(args: argparse.Namespace) -> None:
    """Executes the main workflow."""
    # 0. Infrastructure
    initialize_database()

    # 1. Ingestion
    if not args.skip_fetch:
        logger.info("📥 Fetching games for %s", args.user)
        fetch_and_store_games(username=args.user, limit=args.limit)

    # 2. Engine Analysis
    if not args.skip_analysis:
        logger.info("🧠 Commencing Stockfish Deep Analysis...")
        run_engine_analysis(limit=args.limit)
        run_annotation_batch(limit=args.limit)

    # 3. Achievement Scanning
    logger.info("🏆 Scanning for achievements...")
    process_achievements(
        username=args.user,
        limit=args.limit,
        show_all=args.show_achievements,
        export_pgn=args.export_pgn,
    )

import json
import logging
from tqdm import tqdm

from src.database.connection import get_connection
from src.analysis.stockfish_analyzer import AchievementAnalyzer

logger = logging.getLogger(__name__)

def build_pgn_from_json(game_data):
    """Rebuilds a PGN string with extra safety for missing player data."""
    # Using .get() chains to prevent KeyErrors on aborted/weird games
    white_name = game_data.get("players", {}).get("white", {}).get("name", "Unknown")
    black_name = game_data.get("players", {}).get("black", {}).get("name", "Unknown")
    
    headers = [
        f'[Event "{game_data.get("speed", "rapid").title()} game"]',
        f'[Site "https://lichess.org/{game_data.get("id", "Unknown")}"]',
        f'[White "{white_name}"]',
        f'[Black "{black_name}"]',
        f'[Result "{game_data.get("score", "*")}"]',
    ]
    
    if "opening" in game_data:
        headers.append(f'[ECO "{game_data["opening"].get("eco", "")}"]')
        headers.append(f'[Opening "{game_data["opening"].get("name", "")}"]')
        
    moves = game_data.get('moves', '')
    return "\n".join(headers) + "\n\n" + moves + "\n"

def analyze_pending_games(limit=None):
    """Batch analyzes games with improved error handling and connection management."""
    
    # 1. Fetch pending games
    query = "SELECT id, game_data FROM games WHERE game_data->>'local_analysis_complete' IS NULL"
    if limit:
        query += f" LIMIT {limit}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            pending_games = cur.fetchall()

    if not pending_games:
        logger.info("✨ No pending games require Stockfish analysis.")
        return

    logger.info("⚙️  Found %d game(s) for deep analysis.", len(pending_games))

    # 2. Open DB connection and Engine ONCE for the whole batch
    try:
        # Pass explicit depths here if you want "fast testing"
        with AchievementAnalyzer(low_depth=8, high_depth=16) as analyzer, get_connection() as conn:
            with conn.cursor() as cur:
                
                for game_id, game_data_raw in tqdm(pending_games, desc="Analyzing Games"):
                    try:
                        # Ensure game_data is a dict (psycopg2 usually does this, but safe is better)
                        game_data = game_data_raw if isinstance(game_data_raw, dict) else json.loads(game_data_raw)
                        
                        pgn_string = build_pgn_from_json(game_data)
                        annotated_pgn, local_evals = analyzer.analyze_game(pgn_string)

                        if annotated_pgn:
                            game_data['move_evals'] = local_evals
                            game_data['annotated_pgn'] = annotated_pgn
                            game_data['local_analysis_complete'] = True

                            # Update inside the existing cursor
                            cur.execute(
                                "UPDATE games SET game_data = %s WHERE id = %s",
                                (json.dumps(game_data), game_id)
                            )
                            conn.commit() # Commit each game so we don't lose progress if a later one fails
                        else:
                            logger.warning("  ⚠️ Game %s skipped (Analyzer returned no data)", game_id)

                    except Exception as game_err:
                        logger.error("  ❌ Failed game %s: %s", game_id, game_err)
                        conn.rollback() # Roll back only THIS game's failed update
                        continue # Move to the next game!
                        
    except Exception as batch_err:
        logger.error("💥 Batch processing critical failure: %s", batch_err)

    logger.info("🏁 Stockfish analysis batch complete!")
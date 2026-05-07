import json
import logging
from tqdm import tqdm

from src.database.connection import get_connection
from src.analysis.stockfish_analyzer import AchievementAnalyzer

logger = logging.getLogger(__name__)

def build_pgn_from_json(game_data):
    """
    python-chess needs a PGN string to read. This quickly rebuilds a 
    minimal PGN from your JSONB data so the engine can parse it.
    """
    headers = [
        f'[Event "{game_data.get("speed", "rapid").title()} game"]',
        f'[Site "https://lichess.org/{game_data.get("id", "Unknown")}"]',
        f'[White "{game_data["players"]["white"]["name"]}"]',
        f'[Black "{game_data["players"]["black"]["name"]}"]',
        f'[Result "{game_data.get("score", "*")}"]',
    ]
    
    # Safely handle missing opening data (common in aborted games)
    if "opening" in game_data:
        headers.append(f'[ECO "{game_data["opening"].get("eco", "")}"]')
        headers.append(f'[Opening "{game_data["opening"].get("name", "")}"]')
        
    moves = game_data.get('moves', '')
    return "\n".join(headers) + "\n\n" + moves + "\n"

def analyze_pending_games(limit=None):
    """
    Finds games in the database that haven't been analyzed by Stockfish, 
    runs them through the AchievementAnalyzer, and updates the JSONB payload.
    """
    # 1. Query for unprocessed games
    query = """
        SELECT id, game_data 
        FROM games 
        WHERE game_data->>'local_analysis_complete' IS NULL
    """
    if limit:
        query += f" LIMIT {limit}"

    pending_games = []
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                pending_games = cur.fetchall()
    except Exception as e:
        logger.error("❌ Failed to fetch pending games: %s", e)
        return

    if not pending_games:
        logger.info("✨ No pending games require Stockfish analysis.")
        return

    logger.info("⚙️  Found %d game(s) needing deep analysis. Booting Stockfish...", len(pending_games))

    # 2. Boot Stockfish ONCE for the entire batch
    # NOTE: low_depth=1, high_depth=14 is great for fast testing.
    try:
        with AchievementAnalyzer(low_depth=1, high_depth=14) as analyzer:
            
            # Wrap the loop in tqdm for a smooth terminal progress bar
            for game_id, game_data in tqdm(pending_games, desc="Analyzing Games", unit="game"):
                logger.debug("  -> Analyzing %s", game_id)
                
                # Build PGN and pass it to the analyzer method
                pgn_string = build_pgn_from_json(game_data)
                annotated_pgn, local_evals = analyzer.analyze_game(pgn_string)

                if annotated_pgn:
                    # 3. Update the game_data dictionary
                    game_data['move_evals'] = local_evals
                    game_data['annotated_pgn'] = annotated_pgn
                    game_data['local_analysis_complete'] = True

                    # 4. Save it back to the database safely
                    update_query = """
                        UPDATE games 
                        SET game_data = %s 
                        WHERE id = %s
                    """
                    try:
                        with get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(update_query, (json.dumps(game_data), game_id))
                            conn.commit()
                    except Exception as e:
                        logger.error("  ❌ DB Update failed for %s: %s", game_id, e)
                else:
                    logger.error("  ⚠️ Engine failed to analyze %s", game_id)
                    
    except Exception as e:
        logger.error("💥 Engine critical failure: %s", e)

    logger.info("🏁 Stockfish analysis batch complete!")
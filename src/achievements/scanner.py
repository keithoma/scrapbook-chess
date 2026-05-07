import os
import re
import logging
from datetime import datetime
from src.database.connection import get_connection
from src.achievements.metrics import GameMetrics
from src.achievements.engine import AchievementEngine

logger = logging.getLogger(__name__)

def export_annotated_pgn(game_data, username):
    """Saves the annotated PGN to the debug folder with custom naming."""
    output_dir = "debug/pgn_files"
    os.makedirs(output_dir, exist_ok=True)

    annotated_content = game_data.get('annotated_pgn')
    if not annotated_content:
        logger.debug(f"  [!] No annotated PGN found for {game_data.get('id')}")
        return 

    # 1. Format Filename Data
    ts = game_data.get('timestamp', 0)
    date_str = datetime.fromtimestamp(ts).strftime("%Y%m%d")

    # 2. Determine color (using your username logic)
    is_white = game_data['players']['white']['id'].lower() == username.lower()
    color_str = "white" if is_white else "black"

    # 3. Sanitize Opening Name for OS filesystem safety
    opening_name = game_data.get('opening', {}).get('name', 'Unknown Opening')
    # Remove characters that Windows/Linux/Mac hate in filenames
    safe_opening = re.sub(r'[\\/*?:"<>|]', "", opening_name)

    filename = f"{date_str} {color_str} {safe_opening}.pgn"
    file_path = os.path.join(output_dir, filename)

    # 4. Write File
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(annotated_content)
    
    logger.info(f"  📄 Exported Debug PGN: {filename}")

def process_achievements(username, limit=None, show_all=False, export_pgn=False):
    """
    Scans the database for games and processes them through 
    the achievement engine.
    """
    logger.info(f"🏆 Scanning games for {username}...")

    # We select game_data which now contains your 'local_analysis_complete' info
    query = """
        SELECT id, score, speed, game_data 
        FROM games 
        WHERE (game_data->'players'->'white'->>'id' = %s 
           OR game_data->'players'->'black'->>'id' = %s)
        ORDER BY played_at DESC
    """
    if limit:
        query += f" LIMIT {limit}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (username, username))
            rows = cur.fetchall()

    if not rows:
        logger.warning(f"No games found in database for user: {username}")
        return

    # Initialize the engine
    with get_connection() as conn:
        engine = AchievementEngine(conn.cursor(), username, show_all=show_all)
        
        for game_id, score, speed, game_data in rows:
            # 1. Build Metrics (this now runs your Solista Opening logic too!)
            metrics = GameMetrics(game_id, score, speed, game_data, username)
            
            # 2. Evaluate achievements
            engine.evaluate(metrics)
            
            # 3. Handle Debug Export
            if export_pgn:
                export_annotated_pgn(game_data, username)
                
        conn.commit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process Lichess games and unlock achievements.")
    parser.add_argument("--debug", action="store_true", help="Enable highly verbose debug logging")
    parser.add_argument("--user", type=str, default="noctu2nality", help="Lichess username to target")
    args = parser.parse_args()

    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S"
    )

    if args.debug:
        logger.debug("🪲 DEBUG MODE ACTIVATED: Verbose achievement tracing is ON.")

    process_achievements(username=args.user)
    logger.info("✅ Achievement scan complete!")
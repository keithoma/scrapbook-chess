import json
import chess
import logging
import argparse
from database.connection import get_connection

# Initialize the logger
logger = logging.getLogger(__name__)

def setup_achievements_db():
    """Creates the tracking table for achievements."""
    query = """
    CREATE TABLE IF NOT EXISTS game_achievements (
        game_id TEXT,
        username TEXT,
        achievement_slug TEXT,
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (game_id, achievement_slug)
    );
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
        conn.commit()
    logger.debug("Database table 'game_achievements' verified.")

def grant(cur, game_id, username, slug, print_msg):
    """Attempts to grant an achievement. Logs if it's newly unlocked."""
    query = """
        INSERT INTO game_achievements (game_id, username, achievement_slug) 
        VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING 1;
    """
    cur.execute(query, (game_id, username, slug))
    if cur.fetchone():
        logger.info(f"🎉 New Achievement [{username}]: {print_msg} (Game: {game_id})")
    else:
        logger.debug(f"  - Skipped: '{slug}' already granted for game {game_id}")

def get_draw_reason(moves_string):
    """Replays the game to find the exact rule that triggered the draw."""
    board = chess.Board()
    for move_str in moves_string.split():
        try:
            board.push_san(move_str)
        except ValueError:
            break
            
    if board.is_stalemate(): return "stalemate"
    if board.is_insufficient_material(): return "insufficient-material"
    if board.can_claim_fifty_moves() or board.is_fifty_moves(): return "50-move"
    if board.can_claim_threefold_repetition() or board.is_repetition(): return "3-fold"
    return "agreement"

def process_game(cur, game_id, score, speed, game_data, username):
    """Evaluates a single game for all badges."""
    # --- 1. Basic Setup & Flags ---
    speed = speed.lower()
    total_plies = len(game_data.get('moves', '').split())
    termination = game_data.get('termination', 'unknown').lower()
    
    white_id = game_data['players']['white'].get('id', '').lower()
    is_white = (white_id == username)
    my_color = 'white' if is_white else 'black'
    opp_color = 'black' if is_white else 'white'
    
    is_win = (is_white and score == '1-0') or (not is_white and score == '0-1')
    is_draw = (score == '1/2-1/2')

    evals = game_data.get('move_evals', [])
    division = game_data.get('division', {})
    mid_start = division.get('middle')
    end_start = division.get('end')
    captures = game_data.get('captures', [])

    # --- 2. Evaluation Loop (Accuracy & Punishments) ---
    min_eval_seen = 0
    inaccuracies, mistakes, blunders = 0, 0, 0
    mistakes_punished, blunders_punished = 0, 0
    eval_at_mid, eval_at_end = 0, 0

    for i in range(len(evals)):
        current_eval = evals[i]
        prev_eval = evals[i-1] if i > 0 else 0

        p_eval = current_eval if is_white else -current_eval
        if p_eval < min_eval_seen:
            min_eval_seen = p_eval

        if mid_start and i == mid_start - 1: eval_at_mid = p_eval
        if end_start and i == end_start - 1: eval_at_end = p_eval

        is_player_turn = (is_white and i % 2 == 0) or (not is_white and i % 2 == 1)
        
        if i > 0: # We need a previous move to calculate a drop
            drop = (current_eval - prev_eval) if is_white else -(current_eval - prev_eval)
            
            if is_player_turn:
                if drop <= -300: blunders += 1
                elif drop <= -100: mistakes += 1
                elif drop <= -50: inaccuracies += 1
            else:
                # Opponent's turn: Did they make an error?
                opp_drop = -drop 
                if opp_drop <= -100:
                    # They made a mistake or blunder. Did I punish it?
                    if i + 1 < len(evals):
                        my_response_eval = evals[i+1]
                        my_response_drop = (my_response_eval - current_eval) if is_white else -(my_response_eval - current_eval)
                        
                        # Punishment criteria: I played an inaccuracy or better (drop > -50)
                        if my_response_drop > -50:
                            if opp_drop <= -300:
                                blunders_punished += 1
                            elif opp_drop <= -100:
                                mistakes_punished += 1

    # --- 3. Material & Pawn Logic ---
    piece_values = {'pawn': 1, 'knight': 3, 'bishop': 3, 'rook': 5, 'queen': 9}
    total_material_points = 0
    clean_pawns_won = 0

    for cap in captures:
        if cap['player'] == my_color:
            total_material_points += piece_values.get(cap['piece_taken'], 0)
            
            if cap['piece_taken'] == 'pawn':
                c_ply = cap['ply']
                eval_idx = c_ply - 1 
                is_clean = True
                
                # Check 1: Was taking the pawn a mistake/blunder?
                if 0 < eval_idx < len(evals):
                    current_eval = evals[eval_idx]
                    prev_eval = evals[eval_idx - 1]
                    drop = (current_eval - prev_eval) if is_white else -(current_eval - prev_eval)
                    if drop <= -100:
                        is_clean = False
                
                # Check 2: Was it kept for 5 full turns (10 plies)?
                if is_clean and (total_plies >= c_ply + 10):
                    lost_pawn_soon = False
                    for future_cap in captures:
                        if future_cap['player'] == opp_color and future_cap['piece_taken'] == 'pawn':
                            if c_ply < future_cap['ply'] <= c_ply + 10:
                                lost_pawn_soon = True
                                break
                    if not lost_pawn_soon:
                        clean_pawns_won += 1


    # ==========================================
    # === EVALUATING ACHIEVEMENTS ============
    # ==========================================

    # --- A. Played & Won ---
    grant(cur, game_id, username, 'played-game', "Played a game")
    grant(cur, game_id, username, f'played-{speed}', f"Played a {speed} game")

    if is_win:
        grant(cur, game_id, username, 'won-game', "Won a game")
        grant(cur, game_id, username, f'won-{speed}', f"Won a {speed} game")

        if mid_start and total_plies < mid_start:
            grant(cur, game_id, username, 'win-opening', "Won in the Opening")
        elif end_start and mid_start <= total_plies < end_start:
            grant(cur, game_id, username, 'win-midgame', "Won in the Middle Game")
        elif end_start and total_plies >= end_start:
            grant(cur, game_id, username, 'win-endgame', "Won in the End Game")

        if termination == 'mate': grant(cur, game_id, username, 'win-mate', "Won by Checkmate")
        elif termination == 'resign': grant(cur, game_id, username, 'win-resign', "Won by Resignation")
        elif termination in ['outoftime', 'timeout'] and score != '1/2-1/2': grant(cur, game_id, username, 'win-timeout', "Won by Time Out")
        elif termination in ['abandoned', 'aborted']: grant(cur, game_id, username, 'win-abandon', "Won by Abandonment")

        if mid_start and end_start:
            if eval_at_mid <= -150 and eval_at_end <= -150: grant(cur, game_id, username, 'comeback-midgame-150', "Down 1.5+ after Opening AND Midgame, but won")
            if eval_at_mid <= -200 and (total_plies - mid_start) <= 40: grant(cur, game_id, username, 'comeback-opening-fast', "Down 2.0+ after Opening, won within 20 moves")
            if eval_at_mid <= -300: grant(cur, game_id, username, 'comeback-opening-300', "Down 3.0+ after Opening, but won")
        if end_start and eval_at_end <= -200:
            grant(cur, game_id, username, 'comeback-endgame-200', "Started Endgame down 2.0+, but won")

        if (is_white and min_eval_seen >= 0) or (not is_white and min_eval_seen >= -30):
            grant(cur, game_id, username, 'clean-eval', "Won with eval always above 0.0 (W) or -0.3 (B)")

        if blunders == 0:
            grant(cur, game_id, username, 'no-blunders', "Won without any blunders")
            if mistakes == 0:
                grant(cur, game_id, username, 'no-mistakes-blunders', "Won without mistakes or blunders")
                if inaccuracies == 0:
                    grant(cur, game_id, username, 'perfect-accuracy', "Won without inaccuracies, mistakes, or blunders")

        if total_plies > 160: 
            grant(cur, game_id, username, 'marathon-win', "Won a game longer than 80 moves")

    # --- B. The Great Escapes (Draws) ---
    if is_draw:
        if min_eval_seen <= -300:
            reason = get_draw_reason(game_data.get('moves', ''))
            if reason == '3-fold': grant(cur, game_id, username, 'escape-3-fold', "Drew a lost position via Threefold")
            elif reason == 'agreement': grant(cur, game_id, username, 'escape-agreement', "Drew a lost position by Agreement")
            elif reason == '50-move': grant(cur, game_id, username, 'escape-50-move', "Drew a lost position via 50-Move Rule")
            elif reason == 'insufficient-material': grant(cur, game_id, username, 'escape-insufficient', "Drew a lost position (Insufficient Material)")

        if end_start and eval_at_end <= -200:
            grant(cur, game_id, username, 'escape-endgame-200', "Started Endgame down 2.0+, but managed a draw")

    # --- C. Material & Pawns ---
    if total_material_points >= 20: grant(cur, game_id, username, 'captured-20-points', f"Captured 20+ points of material ({total_material_points} total)")
    if total_material_points >= 30: grant(cur, game_id, username, 'captured-30-points', f"Captured 30+ points of material ({total_material_points} total)")
    if total_material_points >= 39: grant(cur, game_id, username, 'captured-39-points', f"Board Wiper: Captured {total_material_points} points of material")

    if clean_pawns_won >= 1: grant(cur, game_id, username, 'clean-pawn-1', "Won a clean pawn and held it for 5+ turns")
    if clean_pawns_won >= 2: grant(cur, game_id, username, 'clean-pawn-2', "Won 2 clean pawns in a single game")
    if clean_pawns_won >= 3: grant(cur, game_id, username, 'clean-pawn-3', "Pawn Grabber: Won 3+ clean pawns in a single game")

    # --- D. Punishments ---
    if mistakes_punished >= 1: grant(cur, game_id, username, 'punished-mistake-1', "Punished an opponent's mistake")
    if mistakes_punished >= 3: grant(cur, game_id, username, 'punished-mistake-3', f"Opportunist: Punished 3 mistakes in one game")
    if blunders_punished >= 1: grant(cur, game_id, username, 'punished-blunder-1', "Punished an opponent's blunder")
    if blunders_punished >= 2: grant(cur, game_id, username, 'punished-blunder-2', f"Executioner: Punished multiple blunders in one game")


def process_achievements(username='noctu2nality'):
    """Main loop to process all games efficiently."""
    username = username.lower()
    setup_achievements_db()
    
    logger.info(f"🏆 Scanning games for {username}...")
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, score, speed, game_data FROM games;")
            games = cur.fetchall()
            logger.debug(f"Loaded {len(games)} games from the database.")

            for game_id, score, speed, game_data in games:
                logger.debug(f"Analyzing game {game_id}...")
                process_game(cur, game_id, score, speed, game_data, username)
            
            conn.commit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process Lichess games and unlock achievements.")
    parser.add_argument("--debug", action="store_true", help="Enable highly verbose debug logging")
    parser.add_argument("--user", type=str, default="noctu2nality", help="Lichess username to target")
    args = parser.parse_args()

    # Configure the logger based on the --debug flag
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
import json
from database.connection import get_connection

def process_skill_badges(cur, game_id, score, game_data, username):
    username = username.lower()
    is_white = game_data['players']['white'].get('id', '').lower() == username
    is_win = (is_white and score == '1-0') or (not is_white and score == '0-1')
    
    if not is_win:
        return

    division = game_data.get('division', {})
    mid_start = division.get('middle') 
    end_start = division.get('end')    
    evals = game_data.get('move_evals', [])
    total_plies = len(game_data.get('moves', '').split())

    # --- MIDGAME COUNTER-PUNCHER LOGIC ---
    # 1. Did the game end during the Midgame?
    ended_in_midgame = mid_start and end_start and (mid_start <= total_plies < end_start)

    if ended_in_midgame and evals and mid_start:
        try:
            # 2. Get eval at the end of the opening
            opening_eval = evals[mid_start - 1]

            # 3. Were you losing at that point? (Opponent up +2.0)
            was_losing_opening = (is_white and opening_eval <= -200) or (not is_white and opening_eval >= 200)

            if was_losing_opening:
                update_badge_progress(cur, 'opening-comeback-midgame', game_id)
        except IndexError:
            pass

def process_achievements(username='noctu2nality'):
    """Uses a single connection to process all games efficiently."""
    username = username.lower()
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Fetch games
            cur.execute("SELECT id, score, speed, game_data FROM games;")
            games = cur.fetchall()

            for game_id, score, speed, game_data in games:
                # 1. General 'Played'
                update_badge_progress(cur, 'played-game', game_id)

                # 2. Speed 'Played'
                speed_slug = f"played-{speed.lower()}"
                update_badge_progress(cur, speed_slug, game_id)

                # 3. Winning Logic
                white_player = game_data['players']['white'].get('id', '').lower()
                black_player = game_data['players']['black'].get('id', '').lower()
                
                is_white = white_player == username
                is_win = (is_white and score == '1-0') or (not is_white and score == '0-1')

                if is_win:
                    update_badge_progress(cur, 'won-game', game_id)
                    update_badge_progress(cur, f"won-{speed.lower()}", game_id)
            
            # Commit once at the very end of the batch
            conn.commit()

if __name__ == "__main__":
    print("🏆 Scanning games for badges...")
    process_achievements()
    print("✅ Achievement scan complete!")
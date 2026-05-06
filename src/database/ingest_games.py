import json
import requests
from datetime import datetime, timezone
from database.connection import get_connection

# Define the boundary as a timezone-aware datetime object
# 2026-05-01 00:00:00 UTC
MAY_FIRST_2026 = datetime(2026, 5, 1, tzinfo=timezone.utc)

import chess

def extract_game_events(uci_moves_string):
    """
    Simulates a game from a UCI move string and extracts specific events.
    """
    board = chess.Board()
    moves = uci_moves_string.split()
    
    events = {
        "captures": [],
        "en_passants": []
    }
    
    for ply, uci_move in enumerate(moves):
        # The ply starts at 0 (White's move 1). ply % 2 == 0 is White, ply % 2 != 0 is Black.
        move = chess.Move.from_uci(uci_move)
        
        # 1. Check for En Passant
        if board.is_en_passant(move):
            events["en_passants"].append({
                "ply": ply + 1,
                "move": uci_move,
                "player": "white" if board.turn == chess.WHITE else "black"
            })
            
        # 2. Check for Captures (including En Passant)
        if board.is_capture(move):
            # If it's en passant, the captured piece is always a pawn.
            # Otherwise, look at the piece on the destination square *before* the move is pushed.
            if board.is_en_passant(move):
                captured_piece = chess.PAWN
            else:
                captured_piece = board.piece_type_at(move.to_square)
                
            events["captures"].append({
                "ply": ply + 1,
                "piece_taken": chess.piece_name(captured_piece), # Translates integer to 'pawn', 'queen', etc.
                "move": uci_move,
                "player": "white" if board.turn == chess.WHITE else "black"
            })
            
        # Push the move to update the board state for the next iteration
        board.push(move)
        
    return events

def setup_db():
    """Ensures the games table exists before we start ingesting."""
    query = """
    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        platform TEXT,
        played_at TIMESTAMPTZ,
        rated BOOLEAN,
        speed TEXT,
        score TEXT,
        game_data JSONB
    );
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
        conn.commit()

def save_game_to_db(game_data: dict):
    """Inserts a single formatted game into the PostgreSQL database."""
    query = """
        INSERT INTO games (id, platform, played_at, rated, speed, score, game_data)
        VALUES (%s, %s, to_timestamp(%s), %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (
                    game_data['id'],
                    game_data['platform'],
                    game_data['timestamp'],
                    game_data['is_rated'],
                    game_data['speed'],
                    game_data['score'],
                    json.dumps(game_data)
                ))
            conn.commit()
            print(f"💾 {game_data['id']}: Saved to Database")
    except Exception as e:
        print(f"❌ {game_data['id']}: Database Error: {e}")

def parse_player(player_data):
    """Translates Lichess player objects into our schema."""
    if 'aiLevel' in player_data:
        level = player_data['aiLevel']
        return {
            "id": f"stockfish_level_{level}",
            "name": f"Lichess AI Level {level}",
            "rating": 1500,
            "is_bot": True,
            "patron": False
        }
    
    user_info = player_data.get('user', {})
    return {
        "id": user_info.get('id', 'unknown'),
        "name": user_info.get('name', 'Unknown'),
        "rating": player_data.get('rating', 1500),
        "is_bot": user_info.get('title') == 'BOT',
        "patron": user_info.get('patron', False)
    }

def get_score(winner_flag):
    if winner_flag == 'white': return '1-0'
    if winner_flag == 'black': return '0-1'
    return '1/2-1/2'

def format_game_data(raw_game):
    """Maps the raw Lichess JSON to our schema including evaluations."""
    clock_info = raw_game.get('clock', {})
    
    move_evals = []
    if 'analysis' in raw_game:
        for ply in raw_game['analysis']:
            if 'eval' in ply:
                move_evals.append(ply['eval'])
            elif 'mate' in ply:
                move_evals.append(9999 if ply['mate'] > 0 else -9999)

    formatted_game = {
        "id": raw_game.get('id'),
        "platform": "lichess",
        "timestamp": raw_game.get('createdAt', 0) // 1000, 
        "is_rated": raw_game.get('rated', False),
        "is_friend": raw_game.get('source') == 'friend',
        "speed": raw_game.get('speed', 'unknown'),
        "rules": {
            "initial": clock_info.get('initial', 0),
            "increment": clock_info.get('increment', 0)
        },
        "players": {
            "white": parse_player(raw_game.get('players', {}).get('white', {})),
            "black": parse_player(raw_game.get('players', {}).get('black', {}))
        },
        "score": get_score(raw_game.get('winner')),
        "termination": raw_game.get('status', 'unknown'),
        "opening": {
            "eco": raw_game.get('opening', {}).get('eco', ''),
            "name": raw_game.get('opening', {}).get('name', '')
        },
        "moves": raw_game.get('moves', ''),
        "move_times": raw_game.get('clocks', []),
        "move_evals": move_evals,
        "division": raw_game.get('division', {})
    }
    
    # Get the raw UCI moves string
    raw_moves_string = raw_game.get('moves', '')
    
    # Extract our specific achievements/events
    game_events = extract_game_events(raw_moves_string)

    formatted_game = {
        "id": raw_game.get('id'),
        # ... (your existing fields) ...
        "moves": raw_moves_string,
        "captures": game_events["captures"],
        "en_passants": game_events["en_passants"]
    }
    
    return formatted_game

def fetch_and_store_games(username: str, limit: int = 50):
    setup_db()
    url = f"https://lichess.org/api/games/user/{username}"
    
    params = {
        'max': limit,
        'perfType': 'bullet,blitz,rapid,classical', 
        'moves': 'true',
        'opening': 'true',
        'clocks': 'true',
        'evals': 'true' 
    }
    headers = {'Accept': 'application/x-ndjson'}

    print(f"📡 Filtering games for {username} (Since May 1st + Analyzed only)...")
    
    with requests.get(url, params=params, headers=headers, stream=True) as response:
        if response.status_code != 200:
            print(f"❌ API Error: {response.status_code}")
            return

        count = 0
        for line in response.iter_lines():
            if not line: continue
            
            raw_game = json.loads(line)
            game_id = raw_game.get('id')
            
            # Create a datetime object from the Lichess timestamp (ms)
            game_time = datetime.fromtimestamp(raw_game.get('createdAt') / 1000, tz=timezone.utc)

            # --- GATEKEEPER 1: Date Check ---
            if game_time < MAY_FIRST_2026:
                print(f"📅 Reached {game_time.strftime('%Y-%m-%d')}. Stopping fetch.")
                break

            # --- GATEKEEPER 2: Analysis Check ---
            if 'analysis' not in raw_game:
                print(f"⏩ {game_id}: Skipped (No analysis found)")
                continue
            
            # Standard filters (variants/short games)
            if 'initialFen' in raw_game or len(raw_game.get('moves', '').split()) < 4:
                continue
            
            clean_game = format_game_data(raw_game)
            save_game_to_db(clean_game)
            count += 1

        print(f"🏁 Finished! Ingested {count} analyzed games from May.")

if __name__ == "__main__":
    fetch_and_store_games('noctu2nality', limit=50)
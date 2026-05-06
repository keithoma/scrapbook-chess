import chess
import chess.engine
import time

# Update this path if `which stockfish` gives a different location
STOCKFISH_PATH = "/usr/games/stockfish"

def test_position_sharpness(fen: str, depth: int = 15, multipv: int = 3):
    """
    Analyzes a position and prints the top lines to determine sharpness.
    """
    board = chess.Board(fen)
    print(f"\n🧩 Analyzing Position (Depth: {depth}, Lines: {multipv})")
    print("-" * 50)
    print(board)
    print("-" * 50)

    # 1. Boot up the engine
    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    except FileNotFoundError:
        print(f"❌ Could not find Stockfish at {STOCKFISH_PATH}.")
        return

    # Optional: Configure engine memory/threads for speed
    engine.configure({"Threads": 2, "Hash": 64})

    start_time = time.time()

    # 2. Run the analysis
    # We use limit=chess.engine.Limit(depth=depth) instead of time to ensure consistent analysis
    info = engine.analyse(
        board, 
        chess.engine.Limit(depth=depth), 
        multipv=multipv
    )

    elapsed = time.time() - start_time

    # 3. Parse the results
    print(f"⏱️  Analysis took {elapsed:.3f} seconds\n")
    
    evals = []
    
    for i, line in enumerate(info):
        # 'score' is from the engine's perspective (White is +, Black is -).
        # POV(White) standardizes it so positive always means White is winning.
        score = line["score"].white()
        
        # Extract the centipawn value, handling forced mates
        if score.is_mate():
            eval_str = f"M{score.mate()}"
            centipawns = 9999 if score.mate() > 0 else -9999
        else:
            centipawns = score.score()
            eval_str = f"{centipawns / 100:+.2f}"
            
        evals.append(centipawns)
            
        # Get the first move of the proposed line
        best_move = line.get("pv", [None])[0]
        san_move = board.san(best_move) if best_move else "None"
        
        print(f"PV{i+1} | Move: {san_move:5} | Eval: {eval_str}")

    engine.quit()

    # 4. Calculate Sharpness
    if len(evals) >= 2 and abs(evals[0]) != 9999 and abs(evals[1]) != 9999:
        # Sharpness is the gap between the best move and the second best move
        # (Assuming it's White's turn. If Black's turn, the logic flips slightly depending on POV)
        drop_off = abs(evals[0] - evals[1]) / 100
        print(f"\n🔪 Sharpness (Eval Drop to PV2): {drop_off:.2f} pawns")
        
        if drop_off >= 2.0:
            print("⚠️ VERY SHARP: Only one good move keeps the evaluation.")
        elif drop_off >= 1.0:
            print("⚡ SHARP: Alternatives are noticeably worse.")
        else:
            print("🛡️ SOLID: Multiple viable moves available.")

if __name__ == "__main__":
    # Test Case 1: A highly forcing, sharp tactical puzzle position
    sharp_fen = "r1b1k2r/pp2nppp/2n1p3/q1ppP3/3P4/P1PB1N2/2P2PPP/R1BQK2R w KQkq - 3 9"
    test_position_sharpness(sharp_fen, depth=14, multipv=3)

    # Test Case 2: A quiet, solid opening position (Berlin Defense)
    quiet_fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4"
    test_position_sharpness(quiet_fen, depth=14, multipv=3)
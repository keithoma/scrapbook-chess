import chess.pgn
import chess.engine
import io
import sys
import math

STOCKFISH_PATH = "/usr/games/stockfish"

def get_win_chances(cp):
    """Sigmoid conversion: centipawns -> winning probability (0.0 to 1.0)."""
    return 0.5 + 0.5 * (2 / (1 + math.exp(-0.003682 * cp)) - 1)

def get_judgement(delta):
    """Lichess standard error thresholds (Inaccuracy 0.1 removed)."""
    if delta >= 0.3: return "Blunder", 4   # ??
    if delta >= 0.2: return "Mistake", 2   # ?
    return None, None

def analyze_to_pgn(input_pgn: str, low_depth: int = 3, high_depth: int = 22):
    pgn_file = io.StringIO(input_pgn.strip())
    game = chess.pgn.read_game(pgn_file)
    if not game: return

    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        engine.configure({"Threads": 4, "Hash": 256})
    except FileNotFoundError:
        print(f"❌ Stockfish not found", file=sys.stderr)
        return

    node = game
    board = game.board()
    was_previous_error = False

    print(f"; Scanning for Achievements (D{low_depth} vs D{high_depth})...", file=sys.stderr)

    while node.variations:
        next_node = node.variation(0)
        move_played = next_node.move
        
        # --- 1. SHARPNESS & BASELINE (MultiPV 3 at Depth 3) ---
        low_res_list = engine.analyse(board, chess.engine.Limit(depth=low_depth), multipv=3)
        
        w_chances_low = []
        for info in low_res_list:
            cp = info["score"].pov(board.turn).score(mate_score=10000)
            w_chances_low.append(get_win_chances(cp))
        
        best_move_low = low_res_list[0]["pv"][0] if "pv" in low_res_list[0] else None
        best_move_san = board.san(best_move_low) if best_move_low else ""

        # Determine if this was an "Only Move" situation
        is_only_move = False
        if len(w_chances_low) >= 2 and (w_chances_low[0] - w_chances_low[1]) >= 0.20:
            is_only_move = True

        # --- 2. EXECUTE & HIGH DEPTH TRUTH ---
        board.push(move_played)
        high_res = engine.analyse(board, chess.engine.Limit(depth=high_depth))
        post_score_white = high_res["score"].white().score(mate_score=10000)
        
        # Win chance for the side that just moved
        w_after = get_win_chances(post_score_white if not board.turn else -post_score_white)
        
        # --- 3. RE-EVALUATE PLAYER MOVE AT LOW DEPTH ---
        low_move_res = engine.analyse(board, chess.engine.Limit(depth=low_depth))
        low_move_cp = low_move_res["score"].pov(not board.turn).score(mate_score=10000)
        w_low_move = get_win_chances(low_move_cp)

        # --- 4. THE LOGIC ENGINE ---
        low_delta = w_chances_low[0] - w_low_move
        eval_str = f"{post_score_white / 100:.2f}" if abs(post_score_white) < 10000 else "MATE"
        comment = f"[%eval {eval_str}]"

        # A. Check for Brilliancy (Horizon Effect)
        # Depth 3 hated it (Mistake), but Depth 22 says it's basically the best move.
        is_brilliant = (low_delta >= 0.20 and w_after >= (w_chances_low[0] - 0.05))

        if is_brilliant:
            next_node.nags.add(3) # !!
            comment += " !! Brilliancy."
        
        # B. Check for Move Quality (If not brilliant)
        elif move_played == best_move_low:
            if is_only_move:
                next_node.nags.add(3) # !!
                comment += " Excellent Move."
            elif len(w_chances_low) >= 3 and (w_chances_low[0] - w_chances_low[2]) >= 0.20:
                next_node.nags.add(1) # !
                comment += " Good Move."
        
        # C. Check for Errors & Missed Tactics
        else:
            if was_previous_error and is_only_move:
                comment += f" Missed tactic: {best_move_san} was required after the opponent's error."
            
            error_name, error_nag = get_judgement(low_delta)
            if error_name:
                next_node.nags.add(error_nag)
                comment += f" {error_name}."

        # Prepare for next loop
        was_previous_error = (get_judgement(low_delta)[0] is not None)
        next_node.comment = comment
        node = next_node
        print(".", end="", file=sys.stderr, flush=True)

    engine.quit()
    print("\n", file=sys.stderr)
    exporter = chess.pgn.StringExporter(columns=None, headers=True, variations=False, comments=True)
    print(game.accept(exporter))

if __name__ == "__main__":
    # Example PGN variable - ensure yours is defined
    my_pgn_string = """[Event "rated rapid game"]
[Site "https://lichess.org/V4aNmzJh"]
[Date "2026.05.07"]
[Round "-"]
[White "noctu2nality"]
[Black "asyari87"]
[Result "1-0"]
[WhiteElo "1867"]
[BlackElo "1782"]
[TimeControl "600+0"]
[Termination "Normal"]
[GameId "V4aNmzJh"]
[Variant "Standard"]
[ECO "A45"]
[Opening "Indian Defense"]
[StudyName "Game study"]
[ChapterName "noctu2nality (1867) - asyari87 (1782)"]
[ChapterURL "https://lichess.org/study/js7aYoIw/0IbRF0Ll"]
[Annotator "https://lichess.org/@/noctu2nality"]

1. d4 Nf6 2. Nc3 g6 3. e4 Bg7 4. Be3 d6 5. Qd2 Nc6 6. f3 O-O 7. O-O-O Re8 8. g4 Be6 9. d5 Nxd5 10. exd5 Bd7 11. dxc6 Bxc6 12. Bg2 a5 13. h4 a4 14. a3 b5 15. Na2 e5 16. h5 Qf6 17. Nb4 Bd7 18. Nd5 Qd8 19. Bg5 f6 20. Bh6 g5 21. Bxg7 Kxg7 22. Ne2 Be6 23. Nec3 c6 24. Nb4 c5 25. Nba2 b4 26. axb4 cxb4 27. Nd5 b3 28. cxb3 axb3 29. Nac3 Ra1+ 30. Nb1 Qc8+ 31. Nc3 d5 32. f4 d4 33. fxg5 dxc3 34. gxf6+ Kf7 35. Qxc3 Qxc3+ 36. bxc3 Bxg4 37. Rd6 Bf5 38. Kb2 Bc2 39. Bd5+ Kf8 40. Bxb3 Rxb1+ 41. Kxc2 Rxh1 42. Rd7 Rh2+ 43. Kd3 e4+ 44. Ke3 Rh3+ 45. Kd4 e3 46. Rf7+ Kg8 47. Re7+ Kf8 48. Rxh7 Rd8+ 49. Ke5 e2 50. Rh8# 1-0



"""
    
    # Run the analysis
    analyze_to_pgn(my_pgn_string, low_depth=3, high_depth=22)
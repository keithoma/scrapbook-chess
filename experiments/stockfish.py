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
    """Lichess standard error thresholds (?? and ? only)."""
    if delta >= 0.3: return "Blunder", 4   # ??
    if delta >= 0.2: return "Mistake", 2   # ?
    return None, None

def analyze_to_pgn(input_pgn: str, low_depth: int = 1, high_depth: int = 22):
    pgn_file = io.StringIO(input_pgn.strip())
    game = chess.pgn.read_game(pgn_file)
    if not game: return

    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        engine.configure({"Threads": 4, "Hash": 512})
    except FileNotFoundError:
        print(f"❌ Stockfish not found", file=sys.stderr)
        return

    node = game
    board = game.board()
    was_previous_error = False

    print(f"; Reviewing: Truth (D{high_depth}) | Brilliancy Blindspot (D{low_depth})", file=sys.stderr)

    while node.variations:
        next_node = node.variation(0)
        move_played = next_node.move
        
        # --- 1. HIGH DEPTH BASELINE (Truth & Sharpness) ---
        # Get the top 3 moves to see if an 'Only Move' exists
        high_res_list = engine.analyse(board, chess.engine.Limit(depth=high_depth), multipv=3)
        
        w_chances_high = []
        for info in high_res_list:
            cp = info["score"].pov(board.turn).score(mate_score=10000)
            w_chances_high.append(get_win_chances(cp))
        
        best_move_high = high_res_list[0]["pv"][0] if "pv" in high_res_list[0] else None
        best_move_san = board.san(best_move_high) if best_move_high else ""

        # Only Move logic: Is the best move 20% better than the 2nd best?
        is_only_move = False
        if len(w_chances_high) >= 2 and (w_chances_high[0] - w_chances_high[1]) >= 0.20:
            is_only_move = True

        # --- 2. LOW DEPTH BLINDSPOT (D1) ---
        low_res = engine.analyse(board, chess.engine.Limit(depth=low_depth))
        low_best_cp = low_res["score"].pov(board.turn).score(mate_score=10000)
        w_low_best = get_win_chances(low_best_cp)

        # Execute Player Move
        board.push(move_played)
        
        # --- 3. EVALUATE RESULT (Truth & Low Depth) ---
        # Post-move high depth (Truth)
        post_high = engine.analyse(board, chess.engine.Limit(depth=high_depth))
        post_score_white = post_high["score"].white().score(mate_score=10000)
        w_after = get_win_chances(post_score_white if not board.turn else -post_score_white)
        
        # Post-move low depth (Did D1 see this coming?)
        post_low = engine.analyse(board, chess.engine.Limit(depth=low_depth))
        low_move_cp = post_low["score"].pov(not board.turn).score(mate_score=10000)
        w_low_move = get_win_chances(low_move_cp)

        # --- 4. THE LOGIC ---
        # Brilliancy: D1 hated it (drop >= 0.2), D22 loved it (drop < 0.05)
        low_delta = w_low_best - w_low_move
        real_delta = w_chances_high[0] - w_after

        eval_str = f"{post_score_white / 100:.2f}" if abs(post_score_white) < 10000 else "MATE"
        comment = f"[%eval {eval_str}]"

        is_brilliant = (low_delta >= 0.20 and real_delta < 0.05)

        if is_brilliant:
            next_node.nags.add(3) # !!
            comment += " !! Brilliancy."
        elif move_played == best_move_high:
            if is_only_move:
                next_node.nags.add(3) # !!
                comment += " Excellent Move."
            elif len(w_chances_high) >= 3 and (w_chances_high[0] - w_chances_high[2]) >= 0.20:
                next_node.nags.add(1) # !
                comment += " Good Move."
        else:
            # Handle misses and errors
            if was_previous_error and is_only_move:
                comment += f" Missed tactic: {best_move_san} was required after the opponent's error."
            
            error_name, error_nag = get_judgement(real_delta)
            if error_name:
                next_node.nags.add(error_nag)
                comment += f" {error_name}."

        was_previous_error = (get_judgement(real_delta)[0] is not None)
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
[Site "https://lichess.org/0m4AtlD5"]
[Date "2026.05.07"]
[Round "-"]
[White "noctu2nality"]
[Black "dion123"]
[Result "0-1"]
[WhiteElo "1881"]
[BlackElo "1912"]
[TimeControl "600+0"]
[Termination "Time forfeit"]
[GameId "0m4AtlD5"]
[Variant "Standard"]
[ECO "C00"]
[Opening "French Defense: Mediterranean Defense"]
[StudyName "Game study"]
[ChapterName "noctu2nality (1881) - dion123 (1912)"]
[ChapterURL "https://lichess.org/study/js7aYoIw/z4QMKoXb"]
[Annotator "https://lichess.org/@/noctu2nality"]

1. d4 e6 2. e4 Nf6 3. Nd2 Bb4 4. c3 Ba5 5. Ngf3 d5 6. e5 Nfd7 7. Bd3 O-O 8. O-O f5 9. exf6 Nxf6 10. Ne5 Nbd7 11. Re1 Nxe5 12. Rxe5 Qd6 13. Nf3 c5 14. Bg5 Ng4 15. Re1 cxd4 16. h3 dxc3 17. hxg4 cxb2 18. Rb1 Bxe1 19. Qxe1 Qa3 20. Qe3 Qxa2 21. Nd4 Bd7 22. Nxe6 Rfe8 23. Qh3 h6 24. Nc7 Rac8 25. Nxe8 Bxe8 26. Be3 Bb5 27. Bf5 Rf8 28. Bc2 Ba4 29. Bd3 Bb5 30. Bc2 Rc8 31. Bg6 d4 32. Bf4 d3 33. Bxd3 Bxd3 0-1



"""
    
    # Run the analysis
    analyze_to_pgn(my_pgn_string, low_depth=3, high_depth=22)
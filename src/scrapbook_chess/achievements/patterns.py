# patterns.py
"""Achievement move patterns and simple board heuristics.

Small helpers for identifying common motif-based achievements.
"""

import chess


def is_fianchetto_development(
    board: chess.Board, move: chess.Move, my_color: chess.Color
) -> bool:
    """Checks if the move develops a bishop to a standard flank sniper square.

    Examples: b2/g2 for White, b7/g7 for Black.
    """
    piece = board.piece_at(move.from_square)
    if piece is None or piece.piece_type != chess.BISHOP:
        return False

    fianchetto_squares = (
        {chess.B2, chess.G2} if my_color == chess.WHITE else {chess.B7, chess.G7}
    )
    return move.to_square in fianchetto_squares


def track_castling_side(
    board: chess.Board, move: chess.Move
) -> tuple[bool, str | None]:
    """Identifies castling moves and returns the orientation.

    Returns 'K' for King-side and 'Q' for Queen-side.
    """
    if not board.is_castling(move):
        return False, None

    file_to = chess.square_file(move.to_square)
    side = "K" if file_to > 4 else "Q"
    return True, side


def is_clean_capture_quiescent(
    san_moves: list[str],
    start_ply: int,
    my_color: chess.Color,
    captured_type: int,
) -> bool:
    """Checks if a capture cleanly wins material and holds it for 5 turns."""
    board = chess.Board()
    boards_by_ply = [board.copy()]
    
    # 1. Reconstruct all board states
    for move_san in san_moves:
        try:
            move = board.parse_san(move_san)
            board.push(move)
            boards_by_ply.append(board.copy())
        except ValueError:
            break
            
    # Safety check
    if start_ply > len(boards_by_ply) - 1:
        return False

    def get_net_material(b: chess.Board) -> int:
        values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
        my_mat = sum(len(b.pieces(pt, my_color)) * val for pt, val in values.items())
        opp_mat = sum(len(b.pieces(pt, not my_color)) * val for pt, val in values.items())
        return my_mat - opp_mat

    # 2. Walk backwards to find the "peaceful" state before this tactical chain started
    chain_start_ply = start_ply
    while chain_start_ply > 1:
        prev_move_idx = chain_start_ply - 2
        prev_board = boards_by_ply[prev_move_idx]
        try:
            move = prev_board.parse_san(san_moves[prev_move_idx])
            # If the preceding move was also a capture, check, or promotion, the sequence started earlier
            if prev_board.is_capture(move) or prev_board.gives_check(move) or move.promotion:
                chain_start_ply -= 1
            else:
                break
        except ValueError:
            break

    # 3. Establish our baselines
    pre_sequence_board = boards_by_ply[chain_start_ply - 1]
    baseline_balance = get_net_material(pre_sequence_board)
    
    post_capture_board = boards_by_ply[start_ply]
    new_balance = get_net_material(post_capture_board)

    # 4. Did this capture actually gain material compared to the peaceful state?
    # For `3... cxd5`, baseline_balance = 0, new_balance = 0. 0 <= 0 triggers False!
    if new_balance <= baseline_balance:
        return False

    # 5. Survival Check: Do we keep the advantage for 5 full turns (10 plies)?
    current_board = post_capture_board.copy()
    plies_survived = 0
    
    for forward_ply in range(start_ply + 1, len(san_moves) + 1):
        try:
            move = current_board.parse_san(san_moves[forward_ply - 1])
            current_board.push(move)
            
            # If our material drops below the advantage we just won, we didn't hold it
            if get_net_material(current_board) < new_balance:
                return False
                
            plies_survived += 1
            if plies_survived >= 10:
                return True
                
        except ValueError:
            break

    # If the game ends before 10 plies are up, but we maintained the advantage, it counts
    return True
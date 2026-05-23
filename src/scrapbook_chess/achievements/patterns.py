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
    if board.piece_at(move.from_square).piece_type != chess.BISHOP:
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

    # In python-chess, check file position destination to evaluate orientation side
    file_to = chess.square_file(move.to_square)
    side = "K" if file_to > 4 else "Q"
    return True, side


def is_clean_capture_quiescent(
    san_moves: list[str],
    start_ply: int,
    my_color: chess.Color,
    captured_type: int,
) -> bool:
    """Simulates forward to see if a piece capture remains stable for 3 quiet plies."""
    board = chess.Board()
    for ply in range(1, start_ply + 1):
        board.push(board.parse_san(san_moves[ply - 1]))

    def get_net_material(b: chess.Board) -> int:
        """Evaluates total material advantage to properly detect take-backs of any piece."""
        values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
        my_mat = sum(len(b.pieces(pt, my_color)) * val for pt, val in values.items())
        opp_mat = sum(len(b.pieces(pt, not my_color)) * val for pt, val in values.items())
        return my_mat - opp_mat

    baseline_balance = get_net_material(board)
    quiet_plies_remaining = 3

    for forward_ply in range(start_ply + 1, len(san_moves) + 1):
        try:
            move = board.parse_san(san_moves[forward_ply - 1])

            is_capture = board.is_capture(move)
            is_promotion = move.promotion is not None
            gives_check = board.gives_check(move)

            board.push(move)

            # If the opponent "took back" any piece, our total material drops
            if get_net_material(board) < baseline_balance:
                return False

            if is_capture or is_promotion or gives_check:
                quiet_plies_remaining = 3
            else:
                quiet_plies_remaining -= 1

            if quiet_plies_remaining == 0:
                return True

        except ValueError:
            break

    return True
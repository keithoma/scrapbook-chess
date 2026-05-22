import chess


def is_fianchetto_development(board: chess.Board, move: chess.Move, my_color: chess.Color) -> bool:
    """
    Checks if the move develops a bishop to a standard flank sniper square
    (b2/g2 for White, b7/g7 for Black).
    """
    if board.piece_at(move.from_square).piece_type != chess.BISHOP:
        return False

    fianchetto_squares = (
        {chess.B2, chess.G2} if my_color == chess.WHITE else {chess.B7, chess.G7}
    )
    return move.to_square in fianchetto_squares


def track_castling_side(board: chess.Board, move: chess.Move) -> tuple[bool, str | None]:
    """
    Identifies castling moves and returns the orientation ('K' for King-side, 'Q' for Queen-side).
    """
    if not board.is_castling(move):
        return False, None

    # In python-chess, check file position destination to evaluate orientation side
    file_to = chess.square_file(move.to_square)
    side = "K" if file_to > 4 else "Q"
    return True, side
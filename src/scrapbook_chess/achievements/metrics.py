from datetime import datetime, timezone
from typing import Any, Dict, List

import chess

from scrapbook_chess.achievements.patterns import (
    is_fianchetto_development,
    track_castling_side,
)


def _is_clean_capture_quiescent(
    san_moves: List[str],
    start_ply: int,
    my_color: chess.Color,
    captured_type: int,
) -> bool:
    """
    Simulates forward to see if a piece capture remains stable for 3 quiet plies.
    Resets the countdown timer if tactical events (captures, checks, promotions) occur.
    """
    board = chess.Board()
    for ply in range(1, start_ply + 1):
        board.push(board.parse_san(san_moves[ply - 1]))

    def get_net_balance(b):
        return len(b.pieces(captured_type, my_color)) - len(
            b.pieces(captured_type, not my_color)
        )

    baseline_balance = get_net_balance(board)
    quiet_plies_remaining = 3

    for forward_ply in range(start_ply + 1, len(san_moves) + 1):
        try:
            move = board.parse_san(san_moves[forward_ply - 1])

            is_capture = board.is_capture(move)
            is_promotion = move.promotion is not None
            gives_check = board.gives_check(move)

            board.push(move)

            if get_net_balance(board) < baseline_balance:
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


class GameMetrics:
    """
    Aggregates game data, engine evaluations, and annotations into a single,
    easy-to-scan profile for a specific user, perfectly mapping to YAML definitions.
    """

    def __init__(
        self,
        game_id: str,
        game_data: Dict[str, Any],
        annotated_plies: List[Dict[str, Any]],
        move_evals: List[Dict[str, Any]],
        username: str,
    ):
        self.game_id = game_id
        self.username = username.lower()
        self.speed = game_data.get("speed", "unknown").lower()
        self.score = game_data.get("score", "*")

        # --- OPENING METADATA ---
        raw_api = game_data.get("raw_api_response", {})
        opening_data = raw_api.get("opening", {})
        self.opening_name = opening_data.get("name", "Unknown")
        self.opening_eco = opening_data.get("eco", "Unknown")

        # --- PLAYER CONTEXT & COLOR ---
        self.white_id = (
            game_data.get("players", {}).get("white", {}).get("id", "").lower()
        )
        self.is_white = self.white_id == self.username
        self.my_color_name = "white" if self.is_white else "black"
        self.my_color = chess.WHITE if self.is_white else chess.BLACK

        # --- OUTCOMES ---
        self.is_win = (self.is_white and self.score == "1-0") or (
            not self.is_white and self.score == "0-1"
        )
        self.is_draw = self.score == "1/2-1/2"
        self.is_loss = not self.is_win and not self.is_draw
        self.draw_reason = "none"

        # --- USER ACCURACY COUNTERS ---
        self.inaccuracies = 0
        self.mistakes = 0
        self.blunders = 0

        # --- OPPONENT COUNTERS ---
        self.opponent_blunders = 0
        self.opponent_mistakes = 0

        # --- MATERIAL & BOOK METRICS ---
        self.total_material_captured = 0
        self.my_book_moves = 0
        self.total_book_plies = 0
        self.out_of_book_ply = None

        # --- ACPL (Average Centipawn Loss) ---
        self.acpl = 0.0

        # --- YAML METRIC KEY LINKS ---
        self.total_plies = 0
        self.win_phase = None
        self.is_weekend_win = False
        self.is_full_moon_win = False

        self.is_ultrabullet_win = False
        self.is_bullet_win = False
        self.is_blitz_win = False
        self.is_rapid_win = False
        self.is_classical_win = False

        self.rating_diff = 0
        self.draw_rating_diff = 0

        self.en_passant_count = 0
        self.promotion_count = 0
        self.total_checks_delivered = 0
        self.fianchetto_count = 0
        self.opposite_castling_wins = False

        # --- HYBRID CLEAN CAPTURES COUNTERS ---
        self.clean_pawns_count = 0
        self.clean_knights_count = 0
        self.clean_bishops_count = 0
        self.clean_rooks_count = 0
        self.clean_queens_count = 0

        # --- PARSE STATIC RATING VALUES ---
        white_rating = game_data.get("players", {}).get("white", {}).get("rating", 1500)
        black_rating = game_data.get("players", {}).get("black", {}).get("rating", 1500)
        my_rating = white_rating if self.is_white else black_rating
        opp_rating = black_rating if self.is_white else white_rating

        if self.is_win:
            self.rating_diff = max(0, opp_rating - my_rating)
            if self.speed == "ultrabullet":
                self.is_ultrabullet_win = True
            elif self.speed == "bullet":
                self.is_bullet_win = True
            elif self.speed == "blitz":
                self.is_blitz_win = True
            elif self.speed == "rapid":
                self.is_rapid_win = True
            elif self.speed == "classical":
                self.is_classical_win = True

        if self.is_draw:
            self.draw_rating_diff = max(0, opp_rating - my_rating)

        # Environmental Triggers
        played_timestamp = game_data.get("timestamp", 0)
        game_date = datetime.fromtimestamp(played_timestamp, tz=timezone.utc)

        if self.is_win and game_date.weekday() in (5, 6):
            self.is_weekend_win = True

        base_full_moon = datetime(2026, 1, 3, tzinfo=timezone.utc)
        days_since = (game_date - base_full_moon).total_seconds() / 86400.0
        lunar_phase = days_since % 29.530589
        if self.is_win and ((lunar_phase < 1.25) or (lunar_phase > 28.28)):
            self.is_full_moon_win = True

        # Run the single processing pass
        self._aggregate_metrics(annotated_plies, move_evals, game_data.get("moves", ""))

    def _aggregate_metrics(
        self,
        annotated_plies: List[Dict[str, Any]],
        move_evals: List[Dict[str, Any]],
        moves_string: str,
    ):
        """Processes the move list and boards to tally up achievement triggers."""
        board = chess.Board()
        san_moves = moves_string.split()
        self.total_plies = len(san_moves)

        piece_values = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
        }

        total_cpl = 0.0
        my_evaluated_moves_count = 0

        white_castle_side = None
        black_castle_side = None

        for ply, move_san in enumerate(san_moves, start=1):
            is_white_turn = ply % 2 != 0
            is_my_turn = is_white_turn == self.is_white

            try:
                move = board.parse_san(move_san)
            except ValueError:
                break

            # 1. Tally Tactical Material Captures
            if board.is_capture(move):
                captured_piece = (
                    chess.PAWN
                    if board.is_en_passant(move)
                    else board.piece_at(move.to_square).piece_type
                )
                if is_my_turn and captured_piece:
                    self.total_material_captured += piece_values.get(captured_piece, 0)

            # 2. Geometric Core Pattern Detection
            if is_my_turn and board.is_en_passant(move):
                self.en_passant_count += 1

            if is_my_turn and move.promotion:
                self.promotion_count += 1

            if is_my_turn and board.gives_check(move):
                self.total_checks_delivered += 1

            if is_my_turn and is_fianchetto_development(board, move, self.my_color):
                self.fianchetto_count += 1

            is_castle, side = track_castling_side(board, move)
            if is_castle:
                if is_white_turn:
                    white_castle_side = side
                else:
                    black_castle_side = side

            # 3. Extract Data from the Annotation Layer
            if (ply - 1) < len(annotated_plies):
                anno = annotated_plies[ply - 1]
                cls = anno["classification"]

                if anno["is_book"]:
                    self.total_book_plies += 1
                    if is_my_turn:
                        self.my_book_moves += 1
                elif self.out_of_book_ply is None:
                    self.out_of_book_ply = ply

                # Tally move classification counts
                if is_my_turn:
                    if cls == "blunder":
                        self.blunders += 1
                    elif cls == "mistake":
                        self.mistakes += 1
                    elif cls == "inaccuracy":
                        self.inaccuracies += 1
                else:
                    if cls == "blunder":
                        self.opponent_blunders += 1
                    elif cls == "mistake":
                        self.opponent_mistakes += 1

                # 4. Hybrid Logic: Quiet-Window Clean Captures
                if (
                    is_my_turn
                    and board.is_capture(move)
                    and cls not in ("mistake", "blunder")
                ):
                    captured_piece = (
                        chess.PAWN
                        if board.is_en_passant(move)
                        else board.piece_at(move.to_square).piece_type
                    )
                    if _is_clean_capture_quiescent(
                        san_moves, ply, self.my_color, captured_piece
                    ):
                        if captured_piece == chess.PAWN:
                            self.clean_pawns_count += 1
                        elif captured_piece == chess.KNIGHT:
                            self.clean_knights_count += 1
                        elif captured_piece == chess.BISHOP:
                            self.clean_bishops_count += 1
                        elif captured_piece == chess.ROOK:
                            self.clean_rooks_count += 1
                        elif captured_piece == chess.QUEEN:
                            self.clean_queens_count += 1

            # 5. Calculate Centipawn Loss
            if is_my_turn and (ply - 1) < len(move_evals):
                eval_data = move_evals[ply - 1]
                played_score = eval_data["high_depth_eval"]
                top_moves = eval_data.get("high_top_moves", [])

                if (
                    played_score["type"] == "cp"
                    and top_moves
                    and top_moves[0]["eval"]["type"] == "cp"
                ):
                    best_cp = top_moves[0]["eval"]["value"]
                    played_cp = played_score["value"]

                    cpl = max(0, best_cp - played_cp)
                    total_cpl += cpl
                    my_evaluated_moves_count += 1

            board.push(move)

        # Finalize Average Centipawn Loss
        if my_evaluated_moves_count > 0:
            self.acpl = round(total_cpl / my_evaluated_moves_count, 1)

        # Opposite Side Castling Win Check
        if self.is_win and white_castle_side and black_castle_side:
            if white_castle_side != black_castle_side:
                self.opposite_castling_wins = True

        # Process Combat Game Phase length windows
        if self.is_win:
            if self.total_plies <= 20:
                self.win_phase = "opening"
            elif self.total_plies <= 60:
                self.win_phase = "midgame"
            else:
                self.win_phase = "endgame"

        # Extract Draw Reasons
        if self.is_draw:
            if board.is_stalemate():
                self.draw_reason = "stalemate"
            elif board.is_insufficient_material():
                self.draw_reason = "insufficient-material"
            elif board.is_fifty_moves():
                self.draw_reason = "50-move"
            elif board.is_repetition():
                self.draw_reason = "3-fold"
            else:
                self.draw_reason = "agreement"

"""Game metrics aggregation utilities.

Provides functionality to parse game data, calculate performance statistics,
and identify specific tactical patterns or achievements for a given user.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

import chess

from scrapbook_chess.achievements.patterns import (
    is_clean_capture_quiescent,
    is_fianchetto_development,
    track_castling_side,
)

logger = logging.getLogger(__name__)

class GameMetrics:
    """Aggregates custom game triggers to be stored in the metrics JSONB column.

    This class processes raw game history data, tracks move-by-move statistics,
    and classifies the performance of a specific user within a chess game.

    Attributes:
        username (str): The username of the player being analyzed.
        game_id (str): Unique identifier for the game.
        speed (str): The time control category of the game.
        score (str): The final score of the game.
        is_white (bool): True if the user played as White.
        fast_columns (dict): Quick-lookup stats (counts and ACPL) for DB 
            indexing.
        trigger_plies (dict): Mapping of achievement keys to the ply numbers
            where they were triggered.
        triggers (dict): The exhaustive collection of boolean and numeric 
            performance flags.
    """

    def __init__(self, row_data: dict[str, Any], username: str) -> None:
        """Initializes the metrics engine with game data and user context.

        Args:
            row_data: A dictionary containing the raw game record from the database,
                including moves, evaluations, and player metadata.
            username: The player to focus the metric calculation on.
        """
        self.username = username.lower()
        self.game_id = row_data["game_id"]

        self.speed = row_data["time_control"].lower()
        self.score = row_data["score"]
        self.is_white = row_data["white_username"] == self.username
        self.my_color_name = "white" if self.is_white else "black"
        self.my_color = chess.WHITE if self.is_white else chess.BLACK

        self.is_win = (self.is_white and self.score == "1-0") or (
            not self.is_white and self.score == "0-1"
        )
        self.is_draw = self.score == "1/2-1/2"

        my_rating = (
            row_data.get("white_rating" if self.is_white else "black_rating") or 0
        )
        opp_rating = (
            row_data.get("black_rating" if self.is_white else "white_rating") or 0
        )
        rating_diff = opp_rating - my_rating

        self.fast_columns = {
            "blunders_count": 0,
            "mistakes_count": 0,
            "inaccuracies_count": 0,
            "book_moves_count": 0,
            "acpl": 0.0,
        }

        game_date = row_data["played_at"]
        hour = game_date.hour

        self.trigger_plies: dict[str, list[int]] = {}

        self.triggers = {
            "total_plies": 0,
            "my_moves_count": 0,  # NEW
            "is_time_advantage_win": False,  # NEW
            "is_time_scramble_win": False,  # NEW
            "win_phase": None,
            "rating_diff": rating_diff if self.is_win else 0,
            "draw_rating_diff": rating_diff if self.is_draw else 0,
            "is_weekend_win": False,
            "is_full_moon_win": False,
            "is_monday_win": self.is_win and game_date.weekday() == 0,
            "is_tuesday_win": self.is_win and game_date.weekday() == 1,
            "is_wednesday_win": self.is_win and game_date.weekday() == 2,
            "is_thursday_win": self.is_win and game_date.weekday() == 3,
            "is_friday_win": self.is_win and game_date.weekday() == 4,
            "is_saturday_win": self.is_win and game_date.weekday() == 5,
            "is_sunday_win": self.is_win and game_date.weekday() == 6,
            "is_early_morning_win": self.is_win and (5 <= hour < 11),
            "is_noon_win": self.is_win and (11 <= hour < 15),
            "is_afternoon_win": self.is_win and (15 <= hour < 19),
            "is_evening_win": self.is_win and (19 <= hour < 23),
            "is_night_owl_win": self.is_win and (hour >= 23 or hour < 5),
            "is_ultrabullet_win": self.is_win and self.speed == "ultrabullet",
            "is_bullet_win": self.is_win and self.speed == "bullet",
            "is_blitz_win": self.is_win and self.speed == "blitz",
            "is_rapid_win": self.is_win and self.speed == "rapid",
            "is_classical_win": self.is_win and self.speed == "classical",
            "en_passant_count": 0,
            "promotion_count": 0,
            "total_checks_delivered": 0,
            "fianchetto_count": 0,
            "opposite_castling_wins": False,
            "total_material_captured": 0,
            "clean_pawns_count": 0,
            "clean_knights_count": 0,
            "clean_bishops_count": 0,
            "clean_rooks_count": 0,
            "clean_queens_count": 0,
        }

        if self.is_win and game_date.weekday() in (0, 1, 2, 3, 4):
            self.triggers["is_weekday_win"] = True

        if self.is_win and game_date.weekday() in (5, 6):
            self.triggers["is_weekend_win"] = True

        base_full_moon = datetime(2026, 1, 3, tzinfo=UTC)
        days_since = (game_date - base_full_moon).total_seconds() / 86400.0
        lunar_phase = days_since % 29.530589
        if self.is_win and ((lunar_phase < 1.25) or (lunar_phase > 28.28)):
            self.triggers["is_full_moon_win"] = True

        cls_raw = row_data.get("ply_classifications")
        evals_raw = row_data.get("move_evals")
        classifications = (
            json.loads(cls_raw) if isinstance(cls_raw, str) else (cls_raw or [])
        )
        evals = (
            json.loads(evals_raw) if isinstance(evals_raw, str) else (evals_raw or [])
        )

        self._aggregate_tactics(row_data, classifications, evals)

    def _aggregate_tactics(
        self,
        row_data: dict[str, Any],
        classifications: list[dict[str, Any]],
        evals: list[dict[str, Any]],
    ) -> None:
        """Parses move history and computes tactical performance triggers.

        Iterates through the game move-by-move to calculate material capture, 
        time usage, and accuracy metrics. Updates `self.triggers` and 
        `self.fast_columns` in-place.

        Args:
            row_data: The original database row for the game.
            classifications: List of move classifications (blunder, mistake, etc.).
            evals: List of engine evaluation data for each move.
        """
        moves_string = row_data["raw_moves"]
        board = chess.Board()
        san_moves = moves_string.split()
        self.triggers["total_plies"] = len(san_moves)

        # Safely parse clocks for time achievements
        clocks_raw = row_data.get("clocks")
        valid_clocks = []
        if isinstance(clocks_raw, str):
            try:
                valid_clocks = json.loads(clocks_raw)
            except json.JSONDecodeError:
                logger.warning(
                    "Failed to parse clock data for game %s: %s", 
                    self.game_id, 
                    clocks_raw
                )
        elif isinstance(clocks_raw, list):
            valid_clocks = clocks_raw

        valid_clocks = [c for c in valid_clocks if isinstance(c, (int, float))]
        # Lichess clocks are often in hundredths of a second
        clock_unit_divisor = (
            100.0 if (valid_clocks and max(valid_clocks) > 10000) else 1.0
        )

        # Require a reasonably long game (20+ plies) so "always having more time" isn't
        # a 2-move fluke
        always_more_time = bool(valid_clocks) and len(san_moves) >= 20
        scramble_plies = 0
        my_clock = None
        opp_clock = None

        piece_values = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
        }
        white_castle_side, black_castle_side = None, None
        total_cpl = 0.0
        my_evaluated_moves_count = 0

        for ply, move_san in enumerate(san_moves, start=1):
            is_white_turn = ply % 2 != 0
            is_my_turn = is_white_turn == self.is_white

            try:
                move = board.parse_san(move_san)
            except ValueError:
                break

            # Process clocks
            clock_idx = ply - 1
            if clock_idx < len(valid_clocks):
                c_val = valid_clocks[clock_idx] / clock_unit_divisor
                if is_my_turn:
                    my_clock = c_val
                else:
                    opp_clock = c_val

            if my_clock is not None and opp_clock is not None:
                # 1. Scramble applies continuously, so we check it on every single ply
                if my_clock <= 30.0 and opp_clock <= 30.0:
                    scramble_plies += 1

                # 2. Time advantage is ONLY checked at the end of our turn. This
                # naturally shifts the comparison: White's Move 2 vs Black's Move 1.
                if is_my_turn and my_clock < opp_clock:
                    always_more_time = False

                # Both players under 30 seconds
                if my_clock <= 30.0 and opp_clock <= 30.0:
                    scramble_plies += 1

            if board.is_capture(move):
                if board.is_en_passant(move):
                    captured_piece = chess.PAWN
                else:
                    captured = board.piece_at(move.to_square)
                    if captured is None:
                        # Clear, production-ready error handling
                        raise ValueError(
                            f"Illegal State: Board claims a capture at square "
                            f"{move.to_square} at ply {ply}, but no piece exists there."
                        )
                    captured_piece = captured.piece_type

                if is_my_turn and captured_piece:
                    self.triggers["total_material_captured"] += piece_values.get(
                        captured_piece, 0
                    )
                    self.trigger_plies.setdefault("total_material_captured", []).append(
                        ply
                    )

            if is_my_turn:
                self.triggers["my_moves_count"] += 1
                if board.is_en_passant(move):
                    self.triggers["en_passant_count"] += 1
                    self.trigger_plies.setdefault("en_passant_count", []).append(ply)
                if move.promotion:
                    self.triggers["promotion_count"] += 1
                    self.trigger_plies.setdefault("promotion_count", []).append(ply)
                if board.gives_check(move):
                    self.triggers["total_checks_delivered"] += 1
                    self.trigger_plies.setdefault("total_checks_delivered", []).append(
                        ply
                    )
                if is_fianchetto_development(board, move, self.my_color):
                    self.triggers["fianchetto_count"] += 1
                    self.trigger_plies.setdefault("fianchetto_count", []).append(ply)

            is_castle, side = track_castling_side(board, move)
            if is_castle:
                if is_white_turn:
                    white_castle_side = side
                else:
                    black_castle_side = side

            if (ply - 1) < len(classifications):
                anno = classifications[ply - 1]
                cls = anno.get("classification", "normal")

                if is_my_turn:
                    if anno.get("is_book"):
                        self.fast_columns["book_moves_count"] += 1
                    if cls == "blunder":
                        self.fast_columns["blunders_count"] += 1
                    elif cls == "mistake":
                        self.fast_columns["mistakes_count"] += 1
                    elif cls == "inaccuracy":
                        self.fast_columns["inaccuracies_count"] += 1

                if (
                    is_my_turn
                    and board.is_capture(move)
                    and cls not in ("mistake", "blunder")
                ):
                    if board.is_en_passant(move):
                        captured_piece = chess.PAWN
                    else:
                        captured_piece_obj = board.piece_at(move.to_square)
                        # Replaced 'assert' with a descriptive Exception
                        if captured_piece_obj is None:
                            raise ValueError(
                                f"Logic error: Capture move {move} at ply {ply} "
                                f"does not have a piece at square {move.to_square}."
                            )
                        captured_piece = captured_piece_obj.piece_type
                    if is_clean_capture_quiescent(
                        san_moves, ply, self.my_color, captured_piece
                    ):
                        names = {
                            chess.PAWN: "clean_pawns_count",
                            chess.KNIGHT: "clean_knights_count",
                            chess.BISHOP: "clean_bishops_count",
                            chess.ROOK: "clean_rooks_count",
                            chess.QUEEN: "clean_queens_count",
                        }
                        if captured_piece in names:
                            self.triggers[names[captured_piece]] += 1
                            self.trigger_plies.setdefault(
                                names[captured_piece], []
                            ).append(ply)

            if is_my_turn and (ply - 1) < len(evals):
                eval_data = evals[ply - 1]
                played_score = eval_data.get("high_depth_eval", {})
                top_moves = eval_data.get("high_top_moves", [])

                if (
                    played_score.get("type") == "cp"
                    and top_moves
                    and top_moves[0]["eval"]["type"] == "cp"
                ):
                    best_cp = top_moves[0]["eval"]["value"]
                    played_cp = played_score["value"]
                    total_cpl += max(0, best_cp - played_cp)
                    my_evaluated_moves_count += 1

            board.push(move)

        if my_evaluated_moves_count > 0:
            self.fast_columns["acpl"] = round(total_cpl / my_evaluated_moves_count, 1)

        if (
            self.is_win
            and white_castle_side
            and black_castle_side
            and (white_castle_side != black_castle_side)
        ):
            self.triggers["opposite_castling_wins"] = True

        if self.is_win:
            if always_more_time:
                self.triggers["is_time_advantage_win"] = True

            # Require at least 5 full moves under 30s
            if scramble_plies >= 10:
                self.triggers["is_time_scramble_win"] = True

            if self.triggers["total_plies"] <= 20:
                self.triggers["win_phase"] = "opening"
            elif self.triggers["total_plies"] <= 60:
                self.triggers["win_phase"] = "midgame"
            else:
                self.triggers["win_phase"] = "endgame"

    def export_metrics(self) -> dict[str, Any]:
        """Retrieves the aggregated performance triggers.

        Returns:
            A dictionary containing all calculated performance flags and 
            achievement triggers for the current game.
        """
        return self.triggers

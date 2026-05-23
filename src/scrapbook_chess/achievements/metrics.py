"""Game metrics aggregation utilities.

Calculates custom achievement-related triggers (like fianchettos and moon phases)
and packs them into a JSONB dictionary for the Scanner to use.
"""

from datetime import UTC, datetime
from typing import Any

import chess

from scrapbook_chess.achievements.patterns import (
    is_fianchetto_development,
    track_castling_side,
    is_clean_capture_quiescent,
)


class GameMetrics:
    """Aggregates custom game triggers to be stored in the metrics JSONB column."""

    def __init__(
        self,
        row_data: dict[str, Any],
        username: str,
    ) -> None:
        """Initialize using the flat database row dictionary."""
        self.username = username.lower()
        self.game_id = row_data["id"]
        
        # Standard flat metrics
        self.speed = row_data["time_control"].lower()
        self.score = row_data["score"]
        
        # Player Context
        self.is_white = row_data["white_username"] == self.username
        self.my_color_name = "white" if self.is_white else "black"
        self.my_color = chess.WHITE if self.is_white else chess.BLACK

        # Outcomes
        self.is_win = (self.is_white and self.score == "1-0") or (
            not self.is_white and self.score == "0-1"
        )
        self.is_draw = self.score == "1/2-1/2"

        # --- YAML METRIC KEY LINKS (The Property Bag) ---
        self.triggers = {
            "total_plies": 0,
            "win_phase": None,
            "is_weekend_win": False,
            "is_full_moon_win": False,
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

        # Environmental Triggers
        game_date = row_data["played_at"] # Passed in as datetime from DB
        
        if self.is_win and game_date.weekday() in (5, 6):
            self.triggers["is_weekend_win"] = True

        base_full_moon = datetime(2026, 1, 3, tzinfo=UTC)
        days_since = (game_date - base_full_moon).total_seconds() / 86400.0
        lunar_phase = days_since % 29.530589
        if self.is_win and ((lunar_phase < 1.25) or (lunar_phase > 28.28)):
            self.triggers["is_full_moon_win"] = True

        # Process the move lists for custom tactical metrics
        self._aggregate_tactics(
            row_data["raw_moves"], 
            row_data.get("ply_classifications", [])
        )

    def _aggregate_tactics(
        self, moves_string: str, ply_classifications: list[dict[str, Any]]
    ) -> None:
        """Processes the SAN string to tally up tactical achievement triggers."""
        board = chess.Board()
        san_moves = moves_string.split()
        self.triggers["total_plies"] = len(san_moves)

        piece_values = {
            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
            chess.ROOK: 5, chess.QUEEN: 9,
        }

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
                    chess.PAWN if board.is_en_passant(move)
                    else board.piece_at(move.to_square).piece_type
                )
                if is_my_turn and captured_piece:
                    self.triggers["total_material_captured"] += piece_values.get(captured_piece, 0)

            # 2. Geometric Core Pattern Detection
            if is_my_turn:
                if board.is_en_passant(move):
                    self.triggers["en_passant_count"] += 1
                if move.promotion:
                    self.triggers["promotion_count"] += 1
                if board.gives_check(move):
                    self.triggers["total_checks_delivered"] += 1
                if is_fianchetto_development(board, move, self.my_color):
                    self.triggers["fianchetto_count"] += 1

            is_castle, side = track_castling_side(board, move)
            if is_castle:
                if is_white_turn: white_castle_side = side
                else: black_castle_side = side

            # 3. Hybrid Logic: Quiet-Window Clean Captures
            if (ply - 1) < len(ply_classifications):
                cls = ply_classifications[ply - 1].get("classification", "normal")
                
                if (
                    is_my_turn and board.is_capture(move)
                    and cls not in ("mistake", "blunder")
                ):
                    captured_piece = (
                        chess.PAWN if board.is_en_passant(move)
                        else board.piece_at(move.to_square).piece_type
                    )
                    if is_clean_capture_quiescent(san_moves, ply, self.my_color, captured_piece):
                        piece_names = {
                            chess.PAWN: "clean_pawns_count",
                            chess.KNIGHT: "clean_knights_count",
                            chess.BISHOP: "clean_bishops_count",
                            chess.ROOK: "clean_rooks_count",
                            chess.QUEEN: "clean_queens_count",
                        }
                        if captured_piece in piece_names:
                            self.triggers[piece_names[captured_piece]] += 1

            board.push(move)

        # Opposite Side Castling Win Check
        if self.is_win and white_castle_side and black_castle_side and (white_castle_side != black_castle_side):
            self.triggers["opposite_castling_wins"] = True

        # Process Combat Game Phase length windows
        if self.is_win:
            if self.triggers["total_plies"] <= 20: self.triggers["win_phase"] = "opening"
            elif self.triggers["total_plies"] <= 60: self.triggers["win_phase"] = "midgame"
            else: self.triggers["win_phase"] = "endgame"

    def export_metrics(self) -> dict[str, Any]:
        """Returns the fully aggregated property bag to be saved to DB."""
        return self.triggers
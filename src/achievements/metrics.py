# src/achievements/metrics.py

import chess
from typing import List, Dict, Any


class GameMetrics:
    """
    Aggregates game data, engine evaluations, and annotations into a single,
    easy-to-scan profile for a specific user.
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
        self.white_id = game_data.get("players", {}).get("white", {}).get("id", "").lower()
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

        # --- OPPONENT COUNTERS (Great for "Opponent Meltdown" achievements) ---
        self.opponent_blunders = 0
        self.opponent_mistakes = 0

        # --- MATERIAL & BOOK METRICS ---
        self.total_material_captured = 0
        self.my_book_moves = 0
        self.total_book_plies = 0
        self.out_of_book_ply = None

        # --- ACPL (Average Centipawn Loss) ---
        self.acpl = 0.0

        # Run the single processing pass
        self._aggregate_metrics(annotated_plies, move_evals, game_data.get("moves", ""))

    def _aggregate_metrics(
        self,
        annotated_plies: List[Dict[str, Any]],
        move_evals: List[Dict[str, Any]],
        moves_string: str
    ):
        """Processes the move list and boards to tally up achievement triggers."""
        board = chess.Board()
        san_moves = moves_string.split()
        
        # Static weights for chess pieces
        piece_values = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
        }

        total_cpl = 0.0
        my_evaluated_moves_count = 0

        for ply, move_san in enumerate(san_moves, start=1):
            # White plays on odd plies (1, 3, 5), Black plays on even plies (2, 4, 6)
            is_white_turn = (ply % 2 != 0)
            is_my_turn = (is_white_turn == self.is_white)

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

            # 2. Extract Data from the Annotation Layer
            if (ply - 1) < len(annotated_plies):
                anno = annotated_plies[ply - 1]
                cls = anno["classification"]

                if anno["is_book"]:
                    self.total_book_plies += 1
                    if is_my_turn:
                        self.my_book_moves += 1
                elif self.out_of_book_ply is None:
                    self.out_of_book_ply = ply

                # Sort blunders/mistakes by who committed them
                if is_my_turn:
                    if cls == "blunder": self.blunders += 1
                    elif cls == "mistake": self.mistakes += 1
                    elif cls == "inaccuracy": self.inaccuracies += 1
                else:
                    if cls == "blunder": self.opponent_blunders += 1
                    elif cls == "mistake": self.opponent_mistakes += 1

            # 3. Calculate ACPL (Average Centipawn Loss) for User Moves
            if is_my_turn and (ply - 1) < len(move_evals):
                eval_data = move_evals[ply - 1]
                played_score = eval_data["high_depth_eval"]
                top_moves = eval_data.get("high_top_moves", [])

                # Only evaluate standard numeric centipawn positions for ACPL mapping
                if played_score["type"] == "cp" and top_moves and top_moves[0]["eval"]["type"] == "cp":
                    best_cp = top_moves[0]["eval"]["value"]
                    played_cp = played_score["value"]
                    
                    # CPL calculation (Engine values are always perspective-relative in our new setup)
                    cpl = max(0, best_cp - played_cp)
                    total_cpl += cpl
                    my_evaluated_moves_count += 1

            board.push(move)

        # Finalize Average Centipawn Loss
        if my_evaluated_moves_count > 0:
            self.acpl = round(total_cpl / my_evaluated_moves_count, 1)

        # 4. Extract Draw Contexts if applicable
        if self.is_draw:
            if board.is_stalemate(): self.draw_reason = "stalemate"
            elif board.is_insufficient_material(): self.draw_reason = "insufficient-material"
            elif board.is_fifty_moves(): self.draw_reason = "50-move"
            elif board.is_repetition(): self.draw_reason = "3-fold"
            else: self.draw_reason = "agreement"
import io
import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import chess.pgn
import chess.polyglot

from scrapbook_chess.config import BOOK_PATH

logger = logging.getLogger(__name__)


class GameAnnotator:
    """
    Combines raw engine evaluations with opening books to classify moves
    using Lichess-style win-chance drops.
    """

    def __init__(self):
        self.reader: Optional[chess.polyglot.MemoryMappedReader] = None
        try:
            self.reader = chess.polyglot.open_reader(str(BOOK_PATH))
        except FileNotFoundError:
            logger.warning(
                "Opening book (.bin) not found. Book detection disabled."
            )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.reader:
            self.reader.close()

    def annotate_game_moves(
        self, moves_string: str, move_evals: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Loops through the game plies, tags book moves, measures win-chance drops,
        and builds a professionally annotated PGN with NAG symbols (!, ?, ?!, ??).
        """
        game = chess.pgn.read_game(io.StringIO(moves_string))
        if not game:
            return [], ""

        board = game.board()
        annotated_plies = []

        for ply, node in enumerate(game.mainline(), start=1):
            move = node.move
            is_book = self._is_book_move(board, move)

            # Default classification
            classification = "book" if is_book else "normal"
            nag = 0
            drop = 0.0

            # Process engine data if available (Engine stores evaluations matching the ply index)
            if not is_book and (ply - 1) < len(move_evals):
                eval_data = move_evals[ply - 1]

                # Extract scores
                played_score = eval_data["high_depth_eval"]
                top_moves = eval_data.get("high_top_moves", [])
                best_score = top_moves[0]["eval"] if top_moves else played_score

                # Calculate Lichess Win Chance Drops
                w_best = self._to_win_chance(best_score)
                w_played = self._to_win_chance(played_score)
                drop = max(0.0, w_best - w_played)

                # Classify by thresholds (10% mistake, 15% blunder)
                if drop >= 0.15:
                    classification = "blunder"
                    nag = 4  # PGN standard for ??
                elif drop >= 0.10:
                    classification = "mistake"
                    nag = 2  # PGN standard for ?
                elif drop >= 0.05:
                    classification = "inaccuracy"
                    nag = 6  # PGN standard for ?!

            # Apply standard NAG symbols to the PGN tree for exports later
            if nag > 0:
                node.nags.add(nag)

            # Record this ply's profile
            annotated_plies.append(
                {
                    "ply": ply,
                    "move_san": board.san(move),
                    "is_book": is_book,
                    "classification": classification,
                    "win_chance_drop": round(drop, 3),
                }
            )

            board.push(move)

        # Export the final clean PGN string containing the text commentary and symbols
        exporter = chess.pgn.StringExporter(
            columns=None, comments=True, variations=True
        )
        final_pgn = game.accept(exporter)

        return annotated_plies, final_pgn

    def _is_book_move(self, board: chess.Board, move: chess.Move) -> bool:
        if not self.reader:
            return False
        return any(entry.move == move for entry in self.reader.find_all(board))

    @staticmethod
    def _to_win_chance(eval_score: Dict[str, Any]) -> float:
        """Converts cp or mate engine metrics to a clear 0.0 - 1.0 probability scale."""
        if eval_score["type"] == "mate":
            return 1.0 if eval_score["value"] > 0 else 0.0

        # Lichess constant-based centipawn formula
        cp = eval_score["value"]
        return 0.5 + 0.5 * (2 / (1 + math.exp(-0.003682 * cp)) - 1)

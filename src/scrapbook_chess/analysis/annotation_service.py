"""Game annotation utilities.

Wraps opening-book lookup and converts engine evaluations into annotated PGN.
"""

import io
import json
import logging
import math
import types
from typing import Any

import chess.pgn
import chess.polyglot
from psycopg import sql
from tqdm import tqdm

from scrapbook_chess.config import BOOK_PATH
from scrapbook_chess.database.connection import get_connection

logger = logging.getLogger(__name__)


class GameAnnotator:
    """Combines raw engine evaluations with opening books to classify moves.

    Uses Lichess-style win-chance drops for classification and embeds engine
    data (played moves, top candidates, and low-depth comparisons) into PGNs.
    """

    def __init__(self) -> None:
        """Initialize the annotator and open the polyglot book reader if available."""
        self.reader: chess.polyglot.MemoryMappedReader | None = None
        try:
            self.reader = chess.polyglot.open_reader(str(BOOK_PATH))
        except FileNotFoundError:
            logger.warning("Opening book (.bin) not found. Book detection disabled.")

    def __enter__(self) -> "GameAnnotator":
        """Enter the context manager and return the annotator."""
        return self

    def __exit__(
        self,
        exc_type: type | None,
        exc_val: Exception | None,
        exc_tb: types.TracebackType | None,
    ) -> None:
        """Exit the context manager and close the reader if open."""
        if self.reader:
            self.reader.close()

    def annotate_game_moves(
        self, moves_string: str, move_evals: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], str]:
        """Loops through game plies, tags book moves, and measures win-chance drops.

        Builds an annotated PGN with NAG symbols (!, ?, ?!, ??) and embeds
        engine evaluation details as move comments.

        Args:
            moves_string: A space-separated string of the game moves in SAN.
            move_evals: A list of dicts containing engine analysis for each ply.

        Returns:
            A tuple containing a list of ply classification metadata and the
            final PGN string with injected commentary and symbols.
        """
        game = chess.pgn.read_game(io.StringIO(moves_string))
        if not game:
            return [], ""

        board = game.board()
        annotated_plies = []

        for ply, node in enumerate(game.mainline(), start=1):
            move = node.move
            is_book = self._is_book_move(board, move)

            classification = "book" if is_book else "normal"
            nag = 0
            drop = 0.0

            # Process engine data if available and not a book move
            if not is_book and (ply - 1) < len(move_evals):
                eval_data = move_evals[ply - 1]

                # Safety check: ensure the JSON payload is actually a dictionary
                if not isinstance(eval_data, dict):
                    logger.warning(f"Skipping malformed eval data at ply {ply}")
                    board.push(move)
                    continue

                # 1. Classification logic
                played_score = eval_data.get("high_depth_eval")
                if played_score:
                    top_moves = eval_data.get("high_top_moves", [])
                    best_score = top_moves[0]["eval"] if top_moves else played_score

                    w_best = self._to_win_chance(best_score)
                    w_played = self._to_win_chance(played_score)
                    drop = max(0.0, w_best - w_played)

                    if drop >= 0.15:
                        classification, nag = "blunder", 4
                    elif drop >= 0.10:
                        classification, nag = "mistake", 2
                    elif drop >= 0.05:
                        classification, nag = "inaccuracy", 6

                    # 2. Inject engine commentary
                    comment_parts = [f"Eval: {self._format_score(played_score)}"]

                    # Add Top 2 High Depth alternatives
                    if top_moves:
                        alternatives = []
                        for i, choice in enumerate(top_moves[:2], 1):
                            alt_move = choice.get("move")
                            score = self._format_score(choice.get("eval", {}))
                            alternatives.append(f"{i}. {alt_move} ({score})")
                        
                        comment_parts.append(f"Top: {' | '.join(alternatives)}")

                    # Add Low Depth choice
                    low_best = eval_data.get("low_best_move", {})
                    low_move = low_best.get("move")
                    if low_move:
                        score = self._format_score(low_best.get("eval", {}))
                        comment_parts.append(f"Low: {low_move} ({score})")

                    node.comment = " // ".join(comment_parts)

            # Apply NAG symbols
            if nag > 0:
                node.nags.add(nag)

            # Record ply metadata
            annotated_plies.append(
                {
                    "ply": ply,
                    "move_san": board.san(move),
                    "is_book": is_book,
                    "classification": classification,
                    "win_chance_drop": round(drop, 3),
                }
            )
            
            # Now 'move' safely remains the original chess.Move object!
            board.push(move)

        # Export PGN with included comments and variations
        exporter = chess.pgn.StringExporter(
            columns=None, comments=True, variations=True
        )
        return annotated_plies, game.accept(exporter)

    def _is_book_move(self, board: chess.Board, move: chess.Move) -> bool:
        """Checks if the current move exists in the polyglot opening book."""
        if not self.reader:
            return False
        return any(entry.move == move for entry in self.reader.find_all(board))

    @staticmethod
    def _format_score(eval_score: dict[str, Any]) -> str:
        """Formats the EvalScore dictionary for human-readable PGN comments."""
        if not eval_score or "value" not in eval_score:
            return "0.00"

        val = eval_score["value"]
        if eval_score.get("type") == "mate":
            return f"{'+' if val > 0 else ''}M{abs(val)}"

        # Display centipawns as decimal (e.g., +0.50)
        formatted_val = val / 100.0
        return f"{'+' if formatted_val > 0 else ''}{formatted_val:.2f}"

    @staticmethod
    def _to_win_chance(eval_score: dict[str, Any]) -> float:
        """Converts cp or mate engine metrics to a 0.0 - 1.0 probability scale."""
        if not eval_score or "value" not in eval_score:
            return 0.5

        if eval_score.get("type") == "mate":
            return 1.0 if eval_score["value"] > 0 else 0.0

        # Lichess constant-based centipawn formula
        cp = eval_score["value"]
        return 0.5 + 0.5 * (2 / (1 + math.exp(-0.003682 * cp)) - 1)


# =====================================================================
# BATCH PROCESSING ENTRYPOINT (New!)
# =====================================================================


def run_annotation_batch(limit: int | None = None) -> None:
    """Query the DB for ANALYZED games and apply book/engine annotations.

    Reads the raw engine evaluation JSON, applies win-chance drop logic,
    and saves the final polished PGN and ply classifications.
    """
    base_query = (
        "SELECT id, annotated_pgn, move_evals "
        "FROM games "
        "WHERE pipeline_status = 'ANALYZED'"
    )
    
    # Safely compose dynamic SQL for the limit
    if limit:
        query = sql.SQL(base_query + " LIMIT %s")
        params = (limit,)
    else:
        query = sql.SQL(base_query)
        params = ()

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        pending_games = cur.fetchall()

    if not pending_games:
        logger.info("✨ No pending games require annotation.")
        return

    logger.info("📝 Found %d game(s) for PGN annotation.", len(pending_games))

    try:
        with (
            get_connection() as conn,
            GameAnnotator() as annotator,
            conn.cursor() as cur,
        ):
            for game_id, pgn_text, move_evals_raw in tqdm(
                pending_games, desc="Annotating"
            ):
                try:
                    move_evals = (
                        move_evals_raw
                        if isinstance(move_evals_raw, list)
                        else json.loads(move_evals_raw)
                    )

                    # Pass the PGN text and engine data to your logic
                    plies, final_pgn = annotator.annotate_game_moves(
                        pgn_text, move_evals
                    )

                    if plies and final_pgn:
                        # Wrap the static query in sql.SQL
                        update_sql = sql.SQL("""
                            UPDATE games 
                            SET ply_classifications = %s,
                                annotated_pgn = %s,
                                pipeline_status = 'ANNOTATED'
                            WHERE id = %s
                        """)
                        cur.execute(update_sql, (json.dumps(plies), final_pgn, game_id))
                        conn.commit()

                except Exception as game_err:
                    logger.error("❌ Failed annotating game %s: %s", game_id, game_err)
                    conn.rollback()
                    continue

    except Exception as batch_err:
        logger.error("💥 Annotation batch processing critical failure: %s", batch_err)

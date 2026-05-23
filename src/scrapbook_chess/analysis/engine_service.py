"""Engine integration utilities for running Stockfish analyses in batch.

Provides evaluation helpers and a batch runner to analyze pending games.
"""

import io
import json
import logging
import types
from typing import Any, TypedDict

import chess.engine
import chess.pgn
from tqdm import tqdm

from scrapbook_chess.config import (
    HIGH_DEPTH,
    LOW_DEPTH,
    MATE_GRACE_PLIES,
    MATE_GRACE_THRESHOLD,
    STOCKFISH_PATH,
)
from scrapbook_chess.database.connection import get_connection

logger = logging.getLogger(__name__)


class EvalScore(TypedDict):
    """TypedDict for engine evaluation score.

    Attributes:
        type: The evaluation type, either "cp" (centipawns) or "mate".
        value: The numerical score or plies to mate.
    """
    type: str  # "cp" or "mate"
    value: int


class MoveAnalysis(TypedDict):
    """TypedDict describing the per-move analysis payload.

    Attributes:
        ply: The half-move number in the game sequence.
        move_san: The Standard Algebraic Notation (SAN) representation of the move.
        high_depth_eval: The evaluation score at the deeper search limit.
        high_top_moves: A list of alternative top candidate moves and their evaluations.
        low_best_move: The single best move and evaluation found at the lower search limit.
    """
    ply: int
    move_san: str
    high_depth_eval: EvalScore
    high_top_moves: list[dict[str, Any]]
    low_best_move: dict[str, Any]


class StockfishEvaluator:
    """Handles the lifecycle, configurations, and multi-PV queries for Stockfish."""

    def __init__(self, low_depth: int, high_depth: int, threads: int = 4) -> None:
        """Initialize the evaluator with depth ranges and thread count.

        Args:
            low_depth: Search depth limit used for quick, shallow evaluations.
            high_depth: Search depth limit used for deeper, more intensive analysis.
            threads: The number of CPU threads to allocate to the engine. Defaults to 4.
        """
        self.low_depth = low_depth
        self.high_depth = high_depth
        self.threads = threads
        self.engine: chess.engine.SimpleEngine | None = None

    def __enter__(self) -> "StockfishEvaluator":
        """Start the Stockfish engine process and configure it.

        Returns:
            The initialized StockfishEvaluator instance wrapped within the context.
        """
        self.engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH))
        self.engine.configure({"Threads": self.threads, "Hash": 512})
        return self

    def __exit__(
        self,
        exc_type: type | None,
        exc_val: BaseException | None,
        exc_tb: types.TracebackType | None,
    ) -> None:
        """Stop the engine process when leaving the context window.

        Args:
            exc_type: The exception type if an exception occurred, else None.
            exc_val: The exception instance if an exception occurred, else None.
            exc_tb: The traceback instance if an exception occurred, else None.
        """
        if self.engine:
            self.engine.quit()

    def evaluate_game(
        self, pgn_text: str, mate_threshold: int, mate_plies: int
    ) -> tuple[list[MoveAnalysis], str]:
        """Generate per-move engine evaluations and append mate playouts if needed.

        Parses the provided PGN string, steps through each move to perform high and low 
        depth engine evaluations, and structurally extends the game if a winning advantage 
        exists but the game ended prematurely.

        Args:
            pgn_text: The raw PGN text representing the game string.
            mate_threshold: The centipawn boundary above which a position is 
                considered a completely winning advantage for playout triggering.
            mate_plies: Maximum number of plies allowed for the engine playout.

        Returns:
            A tuple containing:
                - A list of dictionary payloads capturing analysis metrics for each move.
                - An amended, string-exported PGN that includes any simulated engine extensions.
        """
        game = chess.pgn.read_game(io.StringIO(pgn_text.strip()))
        if not game:
            return [], pgn_text

        board = game.board()
        analysis_results = []
        terminal_node = game

        for ply, node in enumerate(game.mainline(), start=1):
            move = node.move
            analysis_results.append(self._analyze_position(board, move, ply))
            board.push(move)
            terminal_node = node

        # Execute mate playout if the game ended prematurely and is fully won
        if analysis_results and not board.is_game_over(claim_draw=True):
            last_eval = analysis_results[-1]["high_depth_eval"]
            if last_eval["type"] == "mate" or abs(last_eval["value"]) >= mate_threshold:
                self._run_mate_grace_period(board, terminal_node, max_plies=mate_plies)

        amended_pgn = game.accept(
            chess.pgn.StringExporter(columns=None, comments=True, variations=True)
        )
        return analysis_results, amended_pgn

    def _analyze_position(
        self, board: chess.Board, played_move: chess.Move, ply: int
    ) -> MoveAnalysis:
        """Perform multi-depth evaluation on a single given board state.

        Args:
            board: A chess.Board snapshot representing the position before the move.
            played_move: The actual chess.Move executed by the player.
            ply: The sequential half-move index.

        Returns:
            A MoveAnalysis dictionary mapping out alternative variants and evaluations.
        """
        # High Depth Pass (MultiPV=2)
        high_res = self.engine.analyse(
            board, chess.engine.Limit(depth=self.high_depth), multipv=2
        )

        # Isolate the evaluation of what the human actually played
        played_move_info = next(
            (m for m in high_res if m.get("pv") and m["pv"][0] == played_move),
            None,
        )
        if not played_move_info:
            played_move_info = self.engine.analyse(
                board,
                chess.engine.Limit(depth=self.high_depth),
                root_moves=[played_move],
            )

        # Low Depth Pass
        low_res = self.engine.analyse(board, chess.engine.Limit(depth=self.low_depth))

        return {
            "ply": ply,
            "move_san": board.san(played_move),
            "high_depth_eval": self._parse_score(
                played_move_info.get("score"), board.turn
            ),
            "high_top_moves": [
                {
                    "move": board.san(info["pv"][0]),
                    "eval": self._parse_score(info["score"], board.turn),
                }
                for info in high_res
                if info.get("pv")
            ],
            "low_best_move": {
                "move": board.san(low_res["pv"][0]) if low_res.get("pv") else None,
                "eval": self._parse_score(low_res.get("score"), board.turn),
            },
        }

    def _run_mate_grace_period(
        self,
        board: chess.Board,
        terminal_node: chess.pgn.GameNode,
        max_plies: int,
    ) -> None:
        """Simulate engine versus engine playouts to verify forced mate pathways.

        Appends the resulting generated move chain as commented metadata directly 
        onto the PGN game tree node references.

        Args:
            board: A chess.Board instance at the game's cutoff position.
            terminal_node: The active game tree node matching the current board state.
            max_plies: The strict limit on how many moves the engine can play out.
        """
        sim_board = board.copy()
        sim_moves = []

        for _ in range(max_plies):
            if sim_board.is_game_over(claim_draw=True):
                break
            result = self.engine.play(sim_board, chess.engine.Limit(depth=12))
            if not result or not result.move:
                break
            sim_moves.append(result.move)
            sim_board.push(result.move)

        if sim_board.is_checkmate():
            curr_node = terminal_node
            for move in sim_moves:
                curr_node = curr_node.add_main_variation(move)
                curr_node.comment = "[Engine Playout]"

    @staticmethod
    def _parse_score(
        score_obj: chess.engine.PovScore | None, turn: chess.Color
    ) -> EvalScore:
        """Normalize a python-chess PovScore object into an explicit EvalScore structure.

        Args:
            score_obj: The raw evaluation object generated by the engine, or None.
            turn: The active side's color perspective to orient evaluations.

        Returns:
            An EvalScore dictionary outlining evaluation type and integer score.
        """
        if not score_obj:
            return {"type": "cp", "value": 0}
        pov_score = score_obj.pov(turn)
        if pov_score.is_mate():
            return {"type": "mate", "value": pov_score.mate()}
        return {"type": "cp", "value": pov_score.score() or 0}


# =====================================================================
# BATCH PROCESSING ENTRYPOINT (Replaces engine_runner.py)
# =====================================================================


def run_engine_analysis(limit: int | None = None) -> None:
    """Query the DB for unanalyzed games and run Stockfish evaluations.

    Extracts games missing local analysis metadata, builds appropriate PGN structures,
    processes the engine evaluations through an initialized instance of
    StockfishEvaluator, and flushes updated evaluation results back into the JSON
    database records.

    Args:
        limit: An optional maximum cap on the number of records to process.
    """
    query = (
        "SELECT id, game_data FROM games "
        "WHERE game_data->>'local_analysis_complete' IS NULL"
    )
    if limit:
        query += f" LIMIT {limit}"

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query)
        pending_games = cur.fetchall()

    if not pending_games:
        logger.info("✨ No pending games require Stockfish analysis.")
        return

    logger.info("⚙️  Found %d game(s) for deep engine analysis.", len(pending_games))

    try:
        with (
            get_connection() as conn,
            StockfishEvaluator(low_depth=LOW_DEPTH, high_depth=HIGH_DEPTH)
            as evaluator,
            conn.cursor() as cur,
        ):
            for game_id, game_data_raw in tqdm(
                pending_games, desc="Analyzing Games"
            ):
                try:
                    game_data = (
                        game_data_raw
                        if isinstance(game_data_raw, dict)
                        else json.loads(game_data_raw)
                    )
                    # Rebuild basic PGN frame for python-chess parsing
                    white_name = (
                        game_data.get("players", {})
                        .get("white", {})
                        .get("name", "Unknown")
                    )
                    black_name = (
                        game_data.get("players", {})
                        .get("black", {})
                        .get("name", "Unknown")
                    )
                    result_tag = game_data.get("score", "*")
                    moves_text = game_data.get("moves", "")

                    pgn_string = (
                        f'[White "{white_name}"]\n'
                        f'[Black "{black_name}"]\n'
                        f'[Result "{result_tag}"]\n\n'
                        f"{moves_text}\n"
                    )

                    evals, annotated_pgn = evaluator.evaluate_game(
                        pgn_string,
                        mate_threshold=MATE_GRACE_THRESHOLD,
                        mate_plies=MATE_GRACE_PLIES,
                    )

                    if evals:
                        game_data["move_evals"] = evals
                        game_data["annotated_pgn"] = annotated_pgn
                        game_data["local_analysis_complete"] = True

                        cur.execute(
                            "UPDATE games SET game_data = %s WHERE id = %s",
                            (json.dumps(game_data), game_id),
                        )
                        conn.commit()

                except Exception as game_err:
                    logger.error(
                        "❌ Failed processing game %s: %s",
                        game_id,
                        game_err,
                    )
                    conn.rollback()
                    continue

    except Exception as batch_err:
        logger.error("💥 Engine batch processing critical failure: %s", batch_err)
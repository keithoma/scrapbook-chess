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
from psycopg import sql
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
        high_top_moves: A list of alternative top candidate moves and their 
            evaluations.
        low_best_move: dict containing the single best move and evaluation found 
            at the lower search limit.
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
            threads: The number of CPU threads to allocate to the engine. Defaults 
                to 4.
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
        """Stop the engine process when leaving the context window."""
        if self.engine:
            self.engine.quit()

    def evaluate_game(
        self, pgn_text: str, mate_threshold: float, mate_plies: int
    ) -> tuple[list[MoveAnalysis], str]:
        """Generate per-move engine evaluations and append mate playouts if needed."""
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
            if (last_eval["type"] == "mate" or 
                abs(last_eval["value"]) >= mate_threshold):
                self._run_mate_grace_period(board, terminal_node, max_plies=mate_plies)

        amended_pgn = game.accept(
            chess.pgn.StringExporter(columns=None, comments=True, variations=True)
        )
        return analysis_results, amended_pgn

    def _analyze_position(
        self, board: chess.Board, played_move: chess.Move, ply: int
    ) -> MoveAnalysis:
        """Perform multi-depth evaluation on a single given board state."""
        # Satisfy Pylance that the engine is loaded
        if not self.engine:
            raise RuntimeError("Engine not initialized. Use inside a context manager.")

        # High Depth Pass (MultiPV=2)
        high_res = self.engine.analyse(
            board, chess.engine.Limit(depth=self.high_depth), multipv=2
        )

        # Safely isolate the evaluation of what the human actually played
        played_move_info = None
        for m in high_res:
            pv = m.get("pv")
            if pv and pv[0] == played_move:
                played_move_info = m
                break

        if not played_move_info:
            played_move_info = self.engine.analyse(
                board,
                chess.engine.Limit(depth=self.high_depth),
                root_moves=[played_move],
            )

        # Low Depth Pass
        low_res = self.engine.analyse(board, chess.engine.Limit(depth=self.low_depth))
        
        # Safely parse low depth PV
        low_pv = low_res.get("pv")
        low_best_san = board.san(low_pv[0]) if low_pv else None

        return {
            "ply": ply,
            "move_san": board.san(played_move),
            "high_depth_eval": self._parse_score(
                played_move_info.get("score"), board.turn
            ),
            "high_top_moves": [
                {
                    "move": board.san(info.get("pv", [])[0]),
                    "eval": self._parse_score(info.get("score"), board.turn),
                }
                for info in high_res
                if info.get("pv")
            ],
            "low_best_move": {
                "move": low_best_san,
                "eval": self._parse_score(low_res.get("score"), board.turn),
            },
        }

    def _run_mate_grace_period(
        self,
        board: chess.Board,
        terminal_node: chess.pgn.GameNode,
        max_plies: int,
    ) -> None:
        """Simulate engine versus engine playouts to verify forced mate pathways."""
        if not self.engine:
            raise RuntimeError("Engine not initialized. Use inside a context manager.")

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
        """Normalize a python-chess PovScore object into an EvalScore structure."""
        if not score_obj:
            return {"type": "cp", "value": 0}
            
        pov_score = score_obj.pov(turn)
        
        if pov_score.is_mate():
            mate_val = pov_score.mate()
            # Pylance guard: ensure it's strictly an integer
            return {"type": "mate", "value": mate_val if mate_val is not None else 0}
            
        cp_val = pov_score.score()
        return {"type": "cp", "value": cp_val if cp_val is not None else 0}


# =====================================================================
# BATCH PROCESSING ENTRYPOINT (Refactored for Flat Schema)
# =====================================================================


def run_engine_analysis(limit: int | None = None) -> None:
    """Query the DB for INGESTED games and run Stockfish evaluations."""
    base_query = (
        "SELECT id, white_username, black_username, score, raw_moves "
        "FROM games "
        "WHERE pipeline_status = 'INGESTED'"
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
        logger.info("✨ No pending games require Stockfish analysis.")
        return

    logger.info("⚙️  Found %d game(s) for deep engine analysis.", len(pending_games))

    try:
        with (
            get_connection() as conn,
            StockfishEvaluator(low_depth=LOW_DEPTH, high_depth=HIGH_DEPTH) as evaluator,
            conn.cursor() as cur,
        ):
            for row in tqdm(pending_games, desc="Analyzing Games"):
                game_id, white_name, black_name, result_tag, moves_text = row

                try:
                    # Rebuild basic PGN frame for python-chess parsing
                    pgn_string = (
                        f'[White "{white_name}"]\n'
                        f'[Black "{black_name}"]\n'
                        f'[Result "{result_tag}"]\n\n'
                        f"{moves_text}\n"
                    )

                    evals, engine_pgn = evaluator.evaluate_game(
                        pgn_string,
                        mate_threshold=MATE_GRACE_THRESHOLD,
                        mate_plies=MATE_GRACE_PLIES,
                    )

                    if evals:
                        # Write strictly to our dedicated flat columns using sql.SQL
                        update_sql = sql.SQL("""
                            UPDATE games 
                            SET move_evals = %s, 
                                annotated_pgn = %s, 
                                pipeline_status = 'ANALYZED' 
                            WHERE id = %s
                        """)
                        cur.execute(
                            update_sql, (json.dumps(evals), engine_pgn, game_id)
                        )
                        conn.commit()

                except Exception as game_err:
                    logger.error("❌ Failed processing game %s: %s", game_id, game_err)
                    conn.rollback()
                    continue

    except Exception as batch_err:
        logger.error("💥 Engine batch processing critical failure: %s", batch_err)
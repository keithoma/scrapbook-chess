import io
import json
import logging
from typing import Any, Dict, List, Optional, Tuple, TypedDict

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
    type: str  # "cp" or "mate"
    value: int


class MoveAnalysis(TypedDict):
    ply: int
    move_san: str
    high_depth_eval: EvalScore
    high_top_moves: List[Dict[str, Any]]
    low_best_move: Dict[str, Any]


class StockfishEvaluator:
    """Handles the lifecycle, configurations, and multi-PV queries for the Stockfish engine."""

    def __init__(
        self, low_depth: int, high_depth: int, threads: int = 4
    ) -> None:
        self.low_depth = low_depth
        self.high_depth = high_depth
        self.threads = threads
        self.engine: Optional[chess.engine.SimpleEngine] = None

    def __enter__(self) -> "StockfishEvaluator":
        self.engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH))
        self.engine.configure({"Threads": self.threads, "Hash": 512})
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self.engine:
            self.engine.quit()

    def evaluate_game(
        self, pgn_text: str, mate_threshold: int, mate_plies: int
    ) -> Tuple[List[MoveAnalysis], str]:
        """Generates move-by-move engine evaluations and appends resignation playouts if won."""
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

        # Execute Mate Grace Period Playout if the game ended prematurely but is completely won
        if analysis_results and not board.is_game_over(claim_draw=True):
            last_eval = analysis_results[-1]["high_depth_eval"]
            if (
                last_eval["type"] == "mate"
                or abs(last_eval["value"]) >= mate_threshold
            ):
                self._run_mate_grace_period(
                    board, terminal_node, max_plies=mate_plies
                )

        amended_pgn = game.accept(
            chess.pgn.StringExporter(
                columns=None, comments=True, variations=True
            )
        )
        return analysis_results, amended_pgn

    def _analyze_position(
        self, board: chess.Board, played_move: chess.Move, ply: int
    ) -> MoveAnalysis:
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
        low_res = self.engine.analyse(
            board, chess.engine.Limit(depth=self.low_depth)
        )

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
                "move": board.san(low_res["pv"][0])
                if low_res.get("pv")
                else None,
                "eval": self._parse_score(low_res.get("score"), board.turn),
            },
        }

    def _run_mate_grace_period(
        self,
        board: chess.Board,
        terminal_node: chess.pgn.GameNode,
        max_plies: int,
    ) -> None:
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
        score_obj: Optional[chess.engine.PovScore], turn: chess.Color
    ) -> EvalScore:
        if not score_obj:
            return {"type": "cp", "value": 0}
        pov_score = score_obj.pov(turn)
        if pov_score.is_mate():
            return {"type": "mate", "value": pov_score.mate()}
        return {"type": "cp", "value": pov_score.score() or 0}


# =====================================================================
# BATCH PROCESSING ENTRYPOINT (Replaces engine_runner.py)
# =====================================================================


def run_engine_analysis(limit: Optional[int] = None) -> None:
    """Queries the database for unanalyzed games and updates them with Stockfish evaluations."""
    query = "SELECT id, game_data FROM games WHERE game_data->>'local_analysis_complete' IS NULL"
    if limit:
        query += f" LIMIT {limit}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            pending_games = cur.fetchall()

    if not pending_games:
        logger.info("✨ No pending games require Stockfish analysis.")
        return

    logger.info(
        "⚙️  Found %d game(s) for deep engine analysis.", len(pending_games)
    )

    try:
        with (
            StockfishEvaluator(
                low_depth=LOW_DEPTH, high_depth=HIGH_DEPTH
            ) as evaluator,
            get_connection() as conn,
        ):
            with conn.cursor() as cur:
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
                        pgn_string = (
                            f'[White "{game_data.get("players", {}).get("white", {}).get("name", "Unknown")}"]\n'
                            f'[Black "{game_data.get("players", {}).get("black", {}).get("name", "Unknown")}"]\n'
                            f'[Result "{game_data.get("score", "*")}"]\n\n'
                            f"{game_data.get('moves', '')}\n"
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
        logger.error(
            "💥 Engine batch processing critical failure: %s", batch_err
        )

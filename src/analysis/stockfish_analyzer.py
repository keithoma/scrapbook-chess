"""
Core Engine Logic for Chess Achievement Book.

This module provides the AchievementAnalyzer class, which orchestrates 
Stockfish 16+ to perform 'Blindspot' analysis.
"""

import math
import io
import logging
from typing import Optional, List, Tuple, Dict, Any, TypedDict, Union

import chess.pgn
import chess.engine
import chess.polyglot
from src.config import STOCKFISH_PATH, BOOK_PATH

logger = logging.getLogger(__name__)

class EngineAnalysisData(TypedDict):
    """Explicit definition of the engine analysis results dictionary."""
    high_res: List[chess.engine.InfoDict]
    low_res_before: chess.engine.InfoDict
    post_high: chess.engine.InfoDict
    post_low: chess.engine.InfoDict
    post_high_score: int

class AchievementAnalyzer:
    """
    A context-managed wrapper for Stockfish and Polyglot opening books.
    """

    def __init__(self, low_depth: int = 8, high_depth: int = 22, threads: int = 4) -> None:
        self.low_depth: int = low_depth
        self.high_depth: int = high_depth
        self.threads: int = threads
        self.engine: Optional[chess.engine.SimpleEngine] = None
        self.reader: Optional[chess.polyglot.MemoryMappedReader] = None

    def __enter__(self) -> "AchievementAnalyzer":
        self.engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH))
        self.engine.configure({"Threads": self.threads, "Hash": 512})
        try:
            self.reader = chess.polyglot.open_reader(str(BOOK_PATH))
        except FileNotFoundError:
            logger.warning("Opening book not found. Novelty detection disabled.")
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self.engine:
            self.engine.quit()
        if self.reader:
            self.reader.close()

    def analyze_game(self, input_pgn: str) -> Tuple[Optional[str], List[int]]:
        """
        Orchestrates the analysis of a single game.
        """
        game: Optional[chess.pgn.Game] = chess.pgn.read_game(io.StringIO(input_pgn.strip()))
        if not game:
            return None, []

        board: chess.Board = game.board()
        node: Union[chess.pgn.Game, chess.pgn.ChildNode] = game
        move_evals: List[int] = []
        novelty_found: bool = False

        while node.variations:
            next_node: chess.pgn.ChildNode = node.variation(0)
            move_played: chess.Move = next_node.move

            # 1. Gather Engine Data
            eval_data: EngineAnalysisData = self._get_move_analysis(board, move_played)

            # 2. Check for Novelty (N)
            if self.reader and not novelty_found:
                novelty_found = self._check_for_novelty(board, move_played, next_node)

            # 3. Assign Symbols & Logic
            self._assign_symbols(next_node, move_played, eval_data, board)

            # 4. Update state and log evaluation
            move_evals.append(eval_data['post_high_score'])
            next_node.comment = self._format_comment(eval_data)

            board.push(move_played)
            node = next_node

        return self._export_pgn(game), move_evals

    def _get_move_analysis(self, board: chess.Board, move: chess.Move) -> EngineAnalysisData:
        """
        Runs all necessary engine evaluations for a single position.
        """
        if not self.engine:
            raise RuntimeError("Engine not initialized. Use the 'with' statement.")

        # Pre-move analysis
        high_res = self.engine.analyse(board, chess.engine.Limit(depth=self.high_depth), multipv=3)
        low_res_before = self.engine.analyse(board, chess.engine.Limit(depth=self.low_depth))

        # Execute Move on temporary board
        temp_board: chess.Board = board.copy()
        temp_board.push(move)

        # Post-move analysis
        post_high = self.engine.analyse(temp_board, chess.engine.Limit(depth=self.high_depth))
        post_low = self.engine.analyse(temp_board, chess.engine.Limit(depth=self.low_depth))

        return {
            'high_res': high_res,
            'low_res_before': low_res_before,
            'post_high': post_high,
            'post_low': post_low,
            'post_high_score': post_high["score"].white().score(mate_score=10000) or 0
        }

    def _assign_symbols(
        self, 
        node: chess.pgn.ChildNode, 
        move: chess.Move, 
        data: EngineAnalysisData, 
        board: chess.Board
    ) -> None:
        """Logic gate for assigning NAGs based on engine deltas."""
        pov: bool = not board.turn 

        # Extract scores safely (handling None/Mate)
        score_before_low = data['low_res_before']["score"].pov(board.turn).score(mate_score=10000) or 0
        score_after_low = data['post_low']["score"].pov(pov).score(mate_score=10000) or 0
        score_after_high = data['post_high']["score"].pov(pov).score(mate_score=10000) or 0

        w_before_low = self._calculate_win_chances(score_before_low)
        w_after_low = self._calculate_win_chances(score_after_low)
        w_after_high = self._calculate_win_chances(score_after_high)

        # Brilliancy (!!) - NAG 3
        low_delta = w_before_low - w_after_low
        best_high_score = data['high_res'][0]["score"].pov(board.turn).score(mate_score=10000) or 0
        real_delta = self._calculate_win_chances(best_high_score) - w_after_high

        if low_delta >= 0.15 and real_delta < 0.05:
            node.nags.add(3) # Using raw integer 3 for !!
            return

        # Only Move (□) - NAG 7
        if len(data['high_res']) >= 2:
            s_best = data['high_res'][0]["score"].pov(board.turn).score(mate_score=10000) or 0
            s_second = data['high_res'][1]["score"].pov(board.turn).score(mate_score=10000) or 0
            w_best = self._calculate_win_chances(s_best)
            w_second = self._calculate_win_chances(s_second)

            if (w_best - w_second) >= 0.20 and move == data['high_res'][0]["pv"][0]:
                node.nags.add(7) # Using raw integer 7 for □

    def _format_comment(self, data: EngineAnalysisData) -> str:
        score: int = data['post_high_score']
        eval_str: str = f"{score / 100:.2f}" if abs(score) < 10000 else "MATE"
        return f"[%eval {eval_str}]"

    def _check_for_novelty(
            self, board: chess.Board, 
            move: chess.Move, 
            node: chess.pgn.ChildNode
        ) -> bool:
        if not self.reader:
            return False

        book_moves: List[chess.Move] = [e.move for e in self.reader.find_all(board)]
        if (not book_moves and len(board.move_stack) > 2) or (move not in book_moves):
            node.nags.add(146) # Novelty
            return True
        return False

    @staticmethod
    def _calculate_win_chances(cp: int) -> float:
        return 0.5 + 0.5 * (2 / (1 + math.exp(-0.003682 * cp)) - 1)

    def _export_pgn(self, game: chess.pgn.Game) -> str:
        exporter = chess.pgn.StringExporter(
            columns=None, headers=True, variations=False, comments=True
        )
        return game.accept(exporter)

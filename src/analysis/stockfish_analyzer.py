"""
Core Engine Logic for Chess Achievement Book.
Optimized for dual-depth analysis (Tactical vs. Strategic).
"""

import math
import io
import logging
from typing import Optional, List, Tuple, Dict, Any, TypedDict

import chess.pgn
import chess.engine
import chess.polyglot

from src.config import STOCKFISH_PATH, BOOK_PATH, LOW_DEPTH, HIGH_DEPTH

logger = logging.getLogger(__name__)

class MoveAnalysis(TypedDict):
    ply: int
    move_san: str
    high_depth_eval: float     # The evaluation of the played move @ HIGH_DEPTH
    high_top_moves: List[Dict] # Top 2 engine moves @ HIGH_DEPTH
    low_best_move: Dict        # Best engine move @ LOW_DEPTH
    is_book: bool

class AchievementAnalyzer:
    def __init__(self, threads: int = 4) -> None:
        self.threads = threads
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

    def analyze_game(self, pgn_text: str) -> List[MoveAnalysis]:
        """
        Processes a game and returns a list of decorated move data.
        """
        game = chess.pgn.read_game(io.StringIO(pgn_text.strip()))
        if not game: return []

        board = game.board()
        analysis_results = []
        
        # Calculate total moves for logging
        total_plies = sum(1 for _ in game.mainline())
        
        for ply, node in enumerate(game.mainline(), start=1):
            move = node.move
            
            # 1. Analyze position BEFORE the move
            move_data = self._analyze_position(board, move, ply)
            
            # 2. Add Book Status
            move_data['is_book'] = self._is_book_move(board, move)
            
            analysis_results.append(move_data)
            
            # 3. Update board to next position
            board.push(move)
            
            if ply % 10 == 0:
                logger.info(f"Analyzed {ply}/{total_plies} plies...")

        return analysis_results

    def _analyze_position(self, board: chess.Board, played_move: chess.Move, ply: int) -> MoveAnalysis:
        # --- HIGH DEPTH PASS (MultiPV=2) ---
        # Gets the best two moves in the position
        high_res = self.engine.analyse(board, chess.engine.Limit(depth=HIGH_DEPTH), multipv=2)
        
        # --- PLAYED MOVE EVALUATION ---
        # We need the high-depth eval for the actual move played. 
        # If it's in the MultiPV top 2, we reuse it. Otherwise, we do a targeted search.
        played_move_info = next((m for m in high_res if m.get("pv") and m["pv"][0] == played_move), None)
        if not played_move_info:
            played_move_info = self.engine.analyse(board, chess.engine.Limit(depth=HIGH_DEPTH), root_moves=[played_move])

        # --- LOW DEPTH PASS ---
        # Gets the 'instinctive' best move
        low_res = self.engine.analyse(board, chess.engine.Limit(depth=LOW_DEPTH))

        return {
            "ply": ply,
            "move_san": board.san(played_move),
            "high_depth_eval": self._to_cp(played_move_info.get("score"), board.turn),
            "high_top_moves": [
                {"move": board.san(info["pv"][0]), "eval": self._to_cp(info["score"], board.turn)}
                for info in high_res if info.get("pv")
            ],
            "low_best_move": {
                "move": board.san(low_res["pv"][0]) if low_res.get("pv") else None,
                "eval": self._to_cp(low_res.get("score"), board.turn)
            },
            "is_book": False # Set later
        }

    def _to_cp(self, score_obj: Optional[chess.engine.PovScore], turn: chess.Color) -> float:
        """Standardizes engine score to Centipawns from the perspective of the player to move."""
        if not score_obj: return 0.0
        # POV is relative to the player whose turn it is
        score = score_obj.pov(turn)
        if score.is_mate():
            # Represent mate as a very high score
            return 10000.0 if score.mate() > 0 else -10000.0
        return (score.score() or 0) / 100.0

    def _is_book_move(self, board: chess.Board, move: chess.Move) -> bool:
        if not self.reader: return False
        return any(entry.move == move for entry in self.reader.find_all(board))
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import type { Color } from 'chessops/types';
import type { MoveResult } from '../storage';
import type { Score } from '../stockfish';
export function tacticEngineEvidence(
  candidate: { ply: number; color: Color; beforeFen: string },
  result?: MoveResult,
): { best: Score; played: Score; bestMove: string; lossCp?: number } | undefined {
  if (!result || result.ply !== candidate.ply) return;
  const sign = candidate.color === 'white' ? 1 : -1;
  const best = { ...result.best, value: result.best.value * sign };
  const played = { ...result.played, value: result.played.value * sign };
  const before = Chess.fromSetup(parseFen(candidate.beforeFen).unwrap()).unwrap();
  const bestUci = parseUci(result.bestMove);
  const bestMove = bestUci ? makeSan(before, bestUci) : result.bestMove;
  // Mate distances are not centipawns. Separate shallow searches can also make
  // the forced move look better; never display that noise as a negative loss.
  const lossCp =
    best.type === 'cp' && played.type === 'cp' ? Math.max(0, best.value - played.value) : undefined;
  return { best, played, bestMove, lossCp };
}

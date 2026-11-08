import type { Color } from 'chessops/types';
import type { MoveResult } from '../storage';
import { judgment, pov } from './quality';

export const BEST_MOVE_RULE = { version: 'best-move-v1', maximumDifferenceCp: 10 } as const;
export const ONLY_MOVE_RULE = { version: 'only-move-v1' } as const;

export function bestMove(uci: string, result: MoveResult): boolean {
  if (uci === result.bestMove) return true;
  return result.best.type === 'cp' && result.played.type === 'cp' &&
    Math.abs(result.best.value - result.played.value) <= BEST_MOVE_RULE.maximumDifferenceCp;
}

export function onlyMove(uci: string, color: Color, result: MoveResult): boolean {
  const [first, second] = result.topMoves ?? [];
  if (!first || !second || !bestMove(uci, result)) return false;
  // A sole legal move provides no second-choice evidence. Mate distances stay
  // categorical through the same Lichess judgment used for centipawn scores.
  return judgment(pov(first.score, color), pov(second.score, color)) !== 'clean';
}

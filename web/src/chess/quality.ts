import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { MoveResult } from '../storage';
import type { Score } from '../stockfish';

export type MoveQuality = 'clean' | 'mistake' | 'blunder';
export type MoveJudgment = MoveQuality | 'inaccuracy';
// Lichess Advice.scala 7245313a7b6fb39491e2c2c172cecfea268fc72d:
// https://github.com/lichess-org/lila/blob/7245313a7b6fb39491e2c2c172cecfea268fc72d/modules/tree/src/main/Advice.scala
// Independently implemented numerical convention, shared by all move rules.
export const QUALITY_THRESHOLDS = { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 } as const;
export const winningChances = (cp: number) =>
  Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-0.00368208 * cp)) - 1));
export function judgment(best: Score, played: Score): MoveJudgment {
  if (best.type === 'cp' && played.type === 'cp') {
    const delta = winningChances(best.value) - winningChances(played.value);
    return delta >= QUALITY_THRESHOLDS.blunder ? 'blunder' :
      delta >= QUALITY_THRESHOLDS.mistake ? 'mistake' :
      delta >= QUALITY_THRESHOLDS.inaccuracy ? 'inaccuracy' : 'clean';
  }
  const mateCreated = best.type === 'cp' && played.type === 'mate' && played.value <= 0;
  const mateLost =
    best.type === 'mate' &&
    best.value > 0 &&
    (played.type === 'cp' || (played.type === 'mate' && played.value <= 0));
  if (mateCreated) return best.value < -999 ? 'inaccuracy' : best.value < -700 ? 'mistake' : 'blunder';
  if (mateLost)
    return played.type === 'cp' && played.value > 999
      ? 'inaccuracy'
      : played.type === 'cp' && played.value > 700
        ? 'mistake'
        : 'blunder';
  return 'clean';
}
// Existing achievement and book gates deliberately allow inaccuracies.
export function quality(best: Score, played: Score): MoveQuality {
  const result = judgment(best, played);
  return result === 'inaccuracy' ? 'clean' : result;
}
export function pov(score: Score, color: Color): Score {
  return { ...score, value: score.value * (color === 'white' ? 1 : -1) };
}
// Signed winning chances, including categorical mate scores. Mate zero means
// the side to move is checkmated, regardless of the sign of JavaScript's zero.
export function scoreWinningChances(score: Score, color: Color, turn: Color): number {
  if (score.type === 'cp') return winningChances(pov(score, color).value);
  if (score.value === 0) return turn === color ? -1 : 1;
  return Math.sign(pov(score, color).value);
}
export function moveQuality(game: ReplayGame, result: MoveResult): MoveQuality {
  const move = game.moves[result.ply - 1];
  if (game.frames[result.ply].checkmate) return 'clean'; // Actual checkmate wins immediately.
  return quality(pov(result.best, move.color), pov(result.played, move.color));
}

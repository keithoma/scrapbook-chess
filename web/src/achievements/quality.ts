import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint, type MoveResult } from '../storage';
import type { Score } from '../stockfish';

export type MoveQuality = 'clean' | 'mistake' | 'blunder';
// Lichess Advice.scala 7245313a7b6fb39491e2c2c172cecfea268fc72d:
// https://github.com/lichess-org/lila/blob/7245313a7b6fb39491e2c2c172cecfea268fc72d/modules/tree/src/main/Advice.scala
// Independently implemented numerical convention. Inaccuracies are deliberately
// not classified: only the user's requested mistake and blunder gates apply.
export const winningChances = (cp: number) =>
  Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-0.00368208 * cp)) - 1));
export function quality(best: Score, played: Score): MoveQuality {
  if (best.type === 'cp' && played.type === 'cp') {
    const delta = winningChances(best.value) - winningChances(played.value);
    return delta >= 0.3 ? 'blunder' : delta >= 0.2 ? 'mistake' : 'clean';
  }
  const mateCreated = best.type === 'cp' && played.type === 'mate' && played.value <= 0;
  const mateLost =
    best.type === 'mate' &&
    best.value > 0 &&
    (played.type === 'cp' || (played.type === 'mate' && played.value <= 0));
  if (mateCreated) return best.value < -999 ? 'clean' : best.value < -700 ? 'mistake' : 'blunder';
  if (mateLost)
    return played.type === 'cp' && played.value > 999
      ? 'clean'
      : played.type === 'cp' && played.value > 700
        ? 'mistake'
        : 'blunder';
  return 'clean';
}
export function validAnalysis(
  game: ReplayGame,
  checkpoint?: Checkpoint,
  complete = false,
): checkpoint is Checkpoint {
  return (
    !!checkpoint &&
    checkpoint.pgn === game.pgn &&
    checkpoint.version === ANALYSIS_VERSION &&
    Array.isArray(checkpoint.results) &&
    checkpoint.results.length <= game.moves.length &&
    (!complete || checkpoint.results.length === game.moves.length) &&
    checkpoint.results.every(
      (result, i) =>
        result?.ply === i + 1 &&
        [result.best, result.played].every(
          (score) => score && ['cp', 'mate'].includes(score.type) && Number.isFinite(score.value),
        ),
    )
  );
}
export function pov(score: Score, color: Color): Score {
  return { ...score, value: score.value * (color === 'white' ? 1 : -1) };
}
export function moveQuality(game: ReplayGame, result: MoveResult): MoveQuality {
  const move = game.moves[result.ply - 1];
  if (game.frames[result.ply].checkmate) return 'clean'; // Actual checkmate wins immediately.
  return quality(pov(result.best, move.color), pov(result.played, move.color));
}
export function evaluatedPosition(
  game: ReplayGame,
  checkpoint: Checkpoint,
  board: number,
  color: Color,
): number {
  const score =
    board < checkpoint.results.length
      ? checkpoint.results[board].best
      : checkpoint.results.at(-1)!.played;
  if (score.type === 'cp') return score.value * (color === 'white' ? 1 : -1);
  if (score.value === 0) return game.frames[board].turn === color ? -Infinity : Infinity;
  return Math.sign(score.value) * (color === 'white' ? 1 : -1) * Infinity;
}

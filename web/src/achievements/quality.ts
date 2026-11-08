import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import type { Score } from '../stockfish';

// Compatibility exports for achievement consumers; chess definitions live together.
export { quality, winningChances, pov, moveQuality, type MoveQuality } from '../chess/quality';

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

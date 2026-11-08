import type { ReplayGame } from './game';
import { ANALYSIS_VERSION, type Checkpoint } from './storage';

export function hasCompleteAnalysis(game: ReplayGame, checkpoint?: Checkpoint): boolean {
  return !!checkpoint && checkpoint.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
    && checkpoint.results.length === game.moves.length && checkpoint.virtualStatus !== 'pending';
}

export function hasEngineChoices(game: ReplayGame, checkpoint?: Checkpoint): boolean {
  return !!checkpoint && checkpoint.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION &&
    checkpoint.results.length === game.moves.length && checkpoint.results.every(result => !!result.topMoves?.length);
}

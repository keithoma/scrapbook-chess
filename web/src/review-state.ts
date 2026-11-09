import type { ReplayGame } from './game';
import { ANALYSIS_VERSION, type Checkpoint } from './storage';
import { validCleanGainEvidence } from './chess/clean-gain';

export function hasCompleteAnalysis(game: ReplayGame, checkpoint?: Checkpoint): boolean {
  return !!checkpoint && checkpoint.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
    && checkpoint.results.length === game.moves.length && checkpoint.virtualStatus !== 'pending';
}

export function hasEngineChoices(game: ReplayGame, checkpoint?: Checkpoint): boolean {
  return !!checkpoint && checkpoint.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION &&
    checkpoint.results.length === game.moves.length && checkpoint.results.every(result => !!result.topMoves?.length);
}

export function hasCleanMaterialAnalysis(game: ReplayGame, checkpoint?: Checkpoint): boolean {
  return !!checkpoint && checkpoint.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION &&
    game.moves.filter(move => move.captured).every(move => {
      const evidence = checkpoint.cleanGains?.find(entry => entry.capturePly === move.ply);
      return evidence && !evidence.budgetExhausted && validCleanGainEvidence(game, evidence);
    });
}

import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { validAnalysis, moveQuality } from './quality';

export function precisionContributions(game: ReplayGame, color: Color, winner: Color | undefined, badges: Badge[], checkpoint?: Checkpoint): Contribution[] {
  if (winner !== color || !validAnalysis(game, checkpoint, true)) return [];
  const own = checkpoint.results.filter(result => game.moves[result.ply - 1].color === color);
  return badges.filter(badge => {
    if (badge.config.metric_key === 'is_no_blunder_win') return own.every(result => moveQuality(game, result) !== 'blunder');
    if (badge.config.metric_key === 'is_flawless_win') return own.every(result => moveQuality(game, result) === 'clean');
    if (badge.config.metric_key !== 'is_perfect_eval_win') return false;
    return checkpoint.results.every(result => {
      const score = result.played;
      if (score.type === 'cp') return color === 'white' ? score.value > 0 : score.value < 50;
      if (score.value === 0) return game.frames[result.ply].checkmate && game.frames[result.ply].turn !== color;
      return color === 'white' ? score.value > 0 : score.value < 0;
    });
  }).map(badge => ({ kind: 'badge', badgeId: badge.id, amount: 1, ply: game.moves.length,
    evidence: { analysisVersion: checkpoint.version, rule: 'lichess-quality-v1' } }));
}

import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { validAnalysis, moveQuality, winningChances, pov } from './quality';

export function punishmentContributions(game: ReplayGame, color: Color, badges: Badge[], checkpoint?: Checkpoint): Contribution[] {
  if (!validAnalysis(game, checkpoint, true)) return [];
  const chance = (ply: number) => {
    const score = pov(checkpoint.results[ply - 1].played, color);
    return score.type === 'cp' ? winningChances(score.value)
      : score.value === 0 ? (game.frames[ply].turn === color ? -1 : 1) : Math.sign(score.value);
  };
  const events: Contribution[] = [];
  for (const badge of badges) {
    const target = badge.config.metric_key === 'opponent_mistakes_punished' ? 'mistake'
      : badge.config.metric_key === 'opponent_blunders_punished' ? 'blunder' : undefined;
    if (!target) continue;
    for (let i = 0; i + 1 < game.moves.length; i++) {
      const error = game.moves[i]; const reply = game.moves[i + 1];
      if (error.color === color || reply.color !== color || moveQuality(game, checkpoint.results[i]) !== target
        || moveQuality(game, checkpoint.results[i + 1]) !== 'clean') continue;
      if (chance(reply.ply) + (badge.config.retention_chance_slack ?? 0.02) < chance(error.ply)) continue;
      events.push({ kind: 'badge', badgeId: badge.id, amount: 1, ply: reply.ply, originPly: error.ply,
        evidence: { analysisVersion: checkpoint.version, rule: 'punishment-v1', retainedChances: chance(reply.ply) } });
    }
  }
  return events;
}

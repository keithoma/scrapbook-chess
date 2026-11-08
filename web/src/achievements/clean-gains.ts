import type { Color, Role } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { validAnalysis, moveQuality } from './quality';

const values: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const roles: Record<string, Role> = { clean_pawns_count: 'pawn', clean_knights_count: 'knight', clean_bishops_count: 'bishop', clean_rooks_count: 'rook', clean_queens_count: 'queen' };
export function cleanGainContributions(game: ReplayGame, color: Color, badges: Badge[], checkpoint?: Checkpoint): Contribution[] {
  if (!validAnalysis(game, checkpoint)) return [];
  const events: Contribution[] = [];
  for (const badge of badges) {
    const role = roles[badge.config.metric_key ?? '']; if (!role) continue;
    const survival = badge.config.survival_plies ?? 10;
    for (const move of game.moves) {
      if (move.color !== color || move.captured !== role || move.ply + survival > game.moves.length) continue;
      const analysis = checkpoint.results[move.ply - 1];
      if (!analysis || moveQuality(game, analysis) !== 'clean') continue;
      let gain = 0; let retained = true;
      for (const step of game.moves.slice(move.ply - 1, move.ply + survival)) {
        gain += step.captured ? values[step.captured] * (step.color === color ? 1 : -1) : 0;
        if (gain < values[role]) { retained = false; break; }
      }
      if (retained) events.push({ kind: 'badge', badgeId: badge.id, amount: 1, ply: move.ply + survival,
        originPly: move.ply, evidence: { analysisVersion: checkpoint.version, rule: 'clean-gains-v1', retainedPlies: survival, netMaterial: gain } });
    }
  }
  return events;
}

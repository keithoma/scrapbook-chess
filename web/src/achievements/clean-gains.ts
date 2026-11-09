import type { Color, Role } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { validAnalysis } from './quality';
import { assessCleanGain, CLEAN_GAIN_RULE, MATERIAL_VALUES } from '../chess/clean-gain';
import { openingBook } from '../openings/book';

const roles: Record<string, Role> = {
  clean_pawns_count: 'pawn', clean_knights_count: 'knight', clean_bishops_count: 'bishop',
  clean_rooks_count: 'rook', clean_queens_count: 'queen',
};
export function cleanGainContributions(game: ReplayGame, color: Color, badges: Badge[], checkpoint?: Checkpoint): Contribution[] {
  if (!validAnalysis(game, checkpoint)) return [];
  const events: Contribution[] = [];
  const credited = new Map<number, number>();
  for (const move of game.moves) {
    if (move.color !== color || !move.captured) continue;
    const badge = badges.find(badge => roles[badge.config.metric_key ?? ''] === move.captured);
    if (!badge) continue;
    const assessment = assessCleanGain(game, checkpoint.cleanGains?.find(entry => entry.capturePly === move.ply),
      (pos, candidate) => openingBook.lookup(pos, candidate));
    if (assessment.status !== 'qualified') continue;
    const baseline = assessment.concessionPly!;
    const used = credited.get(baseline) ?? 0;
    const value = MATERIAL_VALUES[move.captured];
    // A single material concession cannot fund the same profit repeatedly.
    const budget = Math.min(assessment.materialGainCp!, assessment.evaluationGainCp! * 100 / CLEAN_GAIN_RULE.evaluationPerPawnCp);
    if (used + value > budget) continue;
    credited.set(baseline, used + value);
    events.push({ kind: 'badge', badgeId: badge.id, amount: 1, ply: move.ply, originPly: baseline,
      evidence: { analysisVersion: checkpoint.version, rule: CLEAN_GAIN_RULE.version,
        evaluationGainCp: assessment.evaluationGainCp!, netMaterialCp: assessment.materialGainCp!, depth: assessment.depth! } });
  }
  return events;
}

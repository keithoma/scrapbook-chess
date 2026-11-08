import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { drawReason } from '../draw-reason';
import { validAnalysis, evaluatedPosition } from './quality';
const reasons: Record<string, string> = {
  is_drawn_from_lost_by_repetition: 'repetition',
  is_drawn_from_lost_by_agreement: 'agreement',
  is_drawn_from_lost_by_50move: 'fifty-move',
  is_drawn_from_lost_by_insufficient: 'insufficient',
};
export function escapeContributions(
  game: ReplayGame,
  color: Color,
  badges: Badge[],
  checkpoint?: Checkpoint,
): Contribution[] {
  const reason = drawReason(game);
  if (!reason || !validAnalysis(game, checkpoint, true)) return [];
  return badges.flatMap((badge) => {
    if (reasons[badge.config.metric_key ?? ''] !== reason) return [];
    const lost = badge.config.lost_cp ?? 300;
    const origin = game.frames
      .slice(0, -1)
      .findIndex((_, index) => evaluatedPosition(game, checkpoint, index, color) <= -lost);
    return origin < 0
      ? []
      : [
          {
            kind: 'badge' as const,
            badgeId: badge.id,
            amount: 1,
            ply: game.moves.length,
            originPly: origin,
            evidence: {
              analysisVersion: checkpoint.version,
              rule: 'draw-recovery-v1',
              reason,
              lostCp: lost,
            },
          },
        ];
  });
}

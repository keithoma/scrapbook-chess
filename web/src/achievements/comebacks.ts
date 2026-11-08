import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { divideGame } from './phases';
import { validAnalysis, evaluatedPosition } from './quality';

export function comebackContributions(game: ReplayGame, color: Color, winner: Color | undefined, badges: Badge[], checkpoint?: Checkpoint): Contribution[] {
  if (!validAnalysis(game, checkpoint, true)) return [];
  const { middle, end } = divideGame(game);
  const score = (board: number) => evaluatedPosition(game, checkpoint, board, color);
  const events: Contribution[] = [];
  for (const badge of badges) {
    let qualifies = false; let origin = middle;
    switch (badge.config.metric_key) {
      case 'is_comeback_from_1_5_down_late': qualifies = winner === color && middle !== undefined && end !== undefined && score(middle) <= -150 && score(end) <= -150; break;
      case 'is_comeback_from_2_0_down_fast': qualifies = winner === color && middle !== undefined && score(middle) <= -200 && game.moves.length - middle <= 40; break;
      case 'is_comeback_from_3_0_down_mid': qualifies = winner === color && middle !== undefined && score(middle) <= -300; break;
      case 'is_comeback_from_2_0_down_endgame': origin = end; qualifies = (winner === color || !winner && game.result === '1/2-1/2') && end !== undefined && score(end) <= -200; break;
    }
    if (qualifies) events.push({ kind: 'badge', badgeId: badge.id, amount: 1, ply: game.moves.length,
      originPly: origin, evidence: { analysisVersion: checkpoint.version, rule: 'comeback-v1' } });
  }
  return events;
}

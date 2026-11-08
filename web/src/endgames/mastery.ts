import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import { pawnVsPawnStart } from '../chess/endgames';
import { gameWinner, isCompletedGame } from '../chess/result';
import { pov, scoreWinningChances } from '../chess/quality';
import { evaluatedPosition, validAnalysis } from '../achievements/quality';
import {
  ENDGAME_POLICY as policy, PAWN_VS_PAWN_MASTERY as definition,
  type EndgameMasteryContribution, type EndgameResult, type EndgameStart,
} from '../achievements/mastery-policy';

export function pawnEndgameAssessment(game: ReplayGame, color: Color, checkpoint?: Checkpoint) {
  const startPly = pawnVsPawnStart(game);
  if (startPly === undefined) return { status: 'unrecognized' as const };
  const own = game.moves.filter(move => move.ply > startPly && move.color === color);
  if (!own.length) return { status: 'no-play' as const, startPly };
  if (!isCompletedGame(game)) return { status: 'unfinished' as const, startPly };
  if (!validAnalysis(game, checkpoint, true)) return { status: 'analysis' as const, startPly };
  const initial = evaluatedPosition(game, checkpoint, startPly, color);
  const startingPosition: EndgameStart = initial > policy.even_cp ? 'winning'
    : initial < -policy.even_cp ? 'losing' : 'even';
  const winner = gameWinner(game);
  const result: EndgameResult = winner === color ? 'win' : winner ? 'loss' : 'draw';
  const losses = own.map(move => {
    const scores = checkpoint.results[move.ply - 1];
    // Both engine searches evaluate moves from the BEFORE position. Mate zero
    // in a played-move search therefore also belongs to that searching side.
    const best = scoreWinningChances(scores.best, color, move.color);
    const played = game.frames[move.ply].checkmate ? 1
      : scoreWinningChances(scores.played, color, move.color);
    return Math.max(0, (best - played) / 2);
  });
  const averageChanceLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;
  const worstChanceLoss = Math.max(...losses);
  const quality = Math.max(0, 1 - averageChanceLoss * policy.average_loss_weight - worstChanceLoss * policy.worst_loss_weight);
  const outcomeScore = policy.outcome_scores[startingPosition][result];
  const score = Math.min(100, outcomeScore * (policy.quality_floor + (1 - policy.quality_floor) * quality));
  const event: EndgameMasteryContribution = {
    kind: 'mastery', family: 'endgame', masteryId: definition.id,
    amount: Math.max(1, Math.round(policy.max_xp * score / 100)), ply: game.moves.length,
    grade: policy.grade_scores.find(band => score >= band.min_score)!.grade,
    evidence: {
      ruleVersion: definition.rule_version, gradeVersion: definition.grade_version,
      analysisVersion: checkpoint.version, endgameId: definition.endgame_id!, startPly,
      startingEvaluation: pov(checkpoint.results[startPly].best, color), startingPosition,
      result, ownMoves: own.length, averageChanceLoss, worstChanceLoss, quality, outcomeScore, score,
    },
  };
  return { status: 'ready' as const, startPly, event };
}

export function endgameContributions(game: ReplayGame, color: Color, checkpoint?: Checkpoint): EndgameMasteryContribution[] {
  const assessment = pawnEndgameAssessment(game, color, checkpoint);
  return assessment.status === 'ready' ? [assessment.event] : [];
}

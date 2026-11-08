import { tacticEngineEvidence } from '../tactics/engine-evidence';
import { skewerCandidates, skewerMaterialThreat, type SkewerCandidate } from '../tactics/skewers';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import { knightForkCandidates, type KnightForkCandidate } from '../tactics/knight-forks';
import { forkMaterialThreat, type MaterialThreat } from '../tactics/fork-material';

import { FORK_MASTERY, SKEWER_MASTERY, qualityXp, forkGrade, tacticGrade, type MasteryContribution, type AnyMasteryContribution } from './mastery-policy';
import { openingContributions } from '../openings/mastery';
export * from './mastery-policy';

export type ForkAssessment =
  | { material: MaterialThreat; status: 'pending' | 'rejected' }
  | {
      material: Extract<MaterialThreat, { status: 'qualified' }>;
      status: 'qualified';
      event: MasteryContribution;
    };
export function assessFork(
  game: ReplayGame,
  fork: KnightForkCandidate,
  checkpoint?: Checkpoint,
): ForkAssessment {
  const material = forkMaterialThreat(game, fork);
  if (material.status !== 'qualified')
    return { material, status: material.status === 'unresolved' ? 'pending' : 'rejected' };
  const result =
    checkpoint?.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
      ? checkpoint.results.find((result) => result.ply === fork.ply)
      : undefined;
  const evidence = tacticEngineEvidence(fork, result);
  if (!evidence) return { material, status: 'pending' };
  const quality = qualityXp(evidence.best, evidence.played);
  if (!quality.xp) return { material, status: 'rejected' };
  return {
    material,
    status: 'qualified',
    event: {
      kind: 'mastery',
      masteryId: FORK_MASTERY.id,
      amount: quality.xp,
      ply: fork.ply,
      grade: forkGrade(evidence.best, evidence.played),
      evidence: {
        ruleVersion: FORK_MASTERY.rule_version,
        analysisVersion: checkpoint!.version,
        best: evidence.best,
        played: evidence.played,
        bestMove: evidence.bestMove,
        gradeVersion: FORK_MASTERY.grade_version,
        lossCp: quality.lossCp,
        materialGainCp: material.gainCp,
        reply: material.reply,
        capture: material.capture,
      },
    },
  };
}
const candidates = new WeakMap<ReplayGame['frames'], KnightForkCandidate[]>();
export function masteryContributions(
  game: ReplayGame,
  color: 'white' | 'black',
  checkpoint?: Checkpoint,
): AnyMasteryContribution[] {
  let forks = candidates.get(game.frames);
  if (!forks) {
    forks = knightForkCandidates(game);
    candidates.set(game.frames, forks);
  }
  const forkEvents = forks
    .filter((fork) => fork.color === color)
    .flatMap((fork) => {
      const assessment = assessFork(game, fork, checkpoint);
      return assessment.status === 'qualified' ? [assessment.event] : [];
    });
  const skewerEvents = skewerCandidates(game)
    .filter((candidate) => candidate.color === color)
    .flatMap((candidate) => {
      const assessment = assessSkewer(game, candidate, checkpoint);
      return assessment.status === 'qualified' ? [assessment.event] : [];
    });
  return [...forkEvents, ...skewerEvents, ...openingContributions(game, color, checkpoint)];
}

export function assessSkewer(
  game: ReplayGame,
  candidate: SkewerCandidate,
  checkpoint?: Checkpoint,
) {
  const material = skewerMaterialThreat(game, candidate);
  if (material.status !== 'qualified')
    return {
      material,
      status: material.status === 'unresolved' ? ('pending' as const) : ('rejected' as const),
    };
  const result =
    checkpoint?.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
      ? checkpoint.results.find((result) => result.ply === candidate.ply)
      : undefined;
  const evidence = tacticEngineEvidence(candidate, result);
  if (!evidence) return { material, status: 'pending' as const };
  const quality = qualityXp(evidence.best, evidence.played, SKEWER_MASTERY);
  if (!quality.xp) return { material, status: 'rejected' as const };
  const event: MasteryContribution = {
    kind: 'mastery',
    masteryId: SKEWER_MASTERY.id,
    amount: quality.xp,
    ply: candidate.ply,
    grade: tacticGrade(evidence.best, evidence.played, SKEWER_MASTERY),
    evidence: {
      ruleVersion: SKEWER_MASTERY.rule_version,
      gradeVersion: SKEWER_MASTERY.grade_version,
      analysisVersion: checkpoint!.version,
      ...evidence,
      lossCp: quality.lossCp,
      materialGainCp: material.gainCp,
      reply: material.reply,
      capture: material.capture,
      skewer: {
        attacker: material.line.attackerName,
        front: material.line.front.name,
        rear: material.line.rear.name,
      },
    },
  };
  return { material, status: 'qualified' as const, event };
}

import { tacticEngineEvidence } from '../tactics/engine-evidence';
import { parse } from 'yaml';
import forkSource from '../../../data/achievements/masteries/tactics/forks.yml?raw';
import skewerSource from '../../../data/achievements/masteries/tactics/skewers.yml?raw';
import policySource from '../../../data/rules/tactical-mastery.yml?raw';
import { skewerCandidates, skewerMaterialThreat, type SkewerCandidate } from '../tactics/skewers';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import type { Score } from '../stockfish';
import { knightForkCandidates, type KnightForkCandidate } from '../tactics/knight-forks';
import { forkMaterialThreat, type MaterialThreat } from '../tactics/fork-material';

export const TACTICAL_GRADES = [
  'D-',
  'D',
  'D+',
  'C-',
  'C',
  'C+',
  'B-',
  'B',
  'B+',
  'A-',
  'A',
  'A+',
  'S-',
  'S',
  'S+',
] as const;
export type TacticalGrade = (typeof TACTICAL_GRADES)[number];
export const MASTERY_IDS = ['mastery_knight_forks', 'mastery_skewers'] as const;
export type MasteryId = (typeof MASTERY_IDS)[number];
export interface MasteryDefinition {
  id: MasteryId;
  type: 'mastery';
  name: 'Knight forks' | 'Skewers';
  rule_version: string;
  grade_version: string;
  grade_bands: { grade: TacticalGrade; max_loss_cp: number }[];
  quality_awards: { max_loss_cp: number; xp: number }[];
  level_thresholds: number[];
  level_requirements: { level: number; high_grade_count: number }[];
}
const policy = parse(policySource);
export const MASTERIES: MasteryDefinition[] = [forkSource, skewerSource].map((source) => {
  const definition = parse(source);
  if (definition.progression !== policy.id)
    throw new Error('Unknown tactical mastery progression.');
  return { ...policy, ...definition };
});
export const FORK_MASTERY = MASTERIES[0];
export const SKEWER_MASTERY = MASTERIES[1];
for (const definition of MASTERIES) {
  if (
    !MASTERY_IDS.includes(definition.id) ||
    definition.type !== 'mastery' ||
    !definition.rule_version ||
    !definition.quality_awards?.length ||
    !definition.grade_version ||
    definition.grade_bands?.length !== TACTICAL_GRADES.length ||
    definition.grade_bands.some(
      (band, i, bands) =>
        band.grade !== TACTICAL_GRADES[TACTICAL_GRADES.length - 1 - i] ||
        !Number.isSafeInteger(band.max_loss_cp) ||
        band.max_loss_cp < 0 ||
        (i > 0 && band.max_loss_cp <= bands[i - 1].max_loss_cp),
    ) ||
    definition.grade_bands.at(-1)?.max_loss_cp !== definition.quality_awards.at(-1)?.max_loss_cp ||
    definition.level_thresholds?.[0] !== 0 ||
    definition.level_thresholds.some(
      (value, i, values) =>
        !Number.isSafeInteger(value) || value < 0 || (i > 0 && value <= values[i - 1]),
    ) ||
    !Array.isArray(definition.level_requirements) ||
    definition.level_requirements.some(
      (gate, i, gates) =>
        !Number.isSafeInteger(gate.level) ||
        gate.level < 2 ||
        gate.level > definition.level_thresholds.length ||
        !Number.isSafeInteger(gate.high_grade_count) ||
        gate.high_grade_count < 1 ||
        (i > 0 && gate.level <= gates[i - 1].level),
    ) ||
    definition.quality_awards.some(
      (band, i, bands) =>
        !Number.isSafeInteger(band.xp) ||
        band.xp <= 0 ||
        !Number.isSafeInteger(band.max_loss_cp) ||
        band.max_loss_cp < 0 ||
        (i > 0 && (band.max_loss_cp <= bands[i - 1].max_loss_cp || band.xp >= bands[i - 1].xp)),
    )
  ) {
    throw new Error('Invalid tactical mastery definition.');
  }
}
export interface MasteryContribution {
  kind: 'mastery';
  masteryId: MasteryId;
  amount: number;
  ply: number;
  grade?: TacticalGrade; // Optional only for contributions saved before grades existed.
  evidence: {
    ruleVersion: string;
    analysisVersion: string;
    best: Score;
    played: Score;
    bestMove: string;
    lossCp?: number;
    gradeVersion?: string;
    materialGainCp: number;
    reply: string;
    capture: string;
    skewer?: { attacker: string; front: string; rear: string };
  };
}
export function masteryProgress(
  xp: number,
  highGrades = 0,
  definition: MasteryDefinition = FORK_MASTERY,
) {
  const thresholds = definition.level_thresholds;
  const xpIndex = Math.max(0, thresholds.filter((threshold) => xp >= threshold).length - 1);
  let index = 0;
  let usedHighGrades = 0;
  for (let candidate = 1; candidate <= xpIndex; candidate++) {
    const gate = definition.level_requirements.find((gate) => gate.level === candidate + 1);
    if (gate && highGrades < usedHighGrades + gate.high_grade_count) break;
    usedHighGrades += gate?.high_grade_count ?? 0;
    index = candidate;
  }
  const floor = thresholds[Math.max(0, index)];
  const next = thresholds[index + 1];
  const requiredHighGrades =
    definition.level_requirements.find((gate) => gate.level === index + 2)?.high_grade_count ?? 0;
  const availableHighGrades = Math.max(0, highGrades - usedHighGrades);
  const remainingHighGrades = Math.max(0, requiredHighGrades - availableHighGrades);
  const remainingXp = next === undefined ? 0 : Math.max(0, next - xp);
  return {
    xp,
    level: index + 1,
    xpLevel: xpIndex + 1,
    floor,
    next,
    highGrades,
    usedHighGrades,
    availableHighGrades,
    requiredHighGrades,
    remainingHighGrades,
    remainingXp,
    gradeLocked: next !== undefined && remainingXp === 0 && remainingHighGrades > 0,
    gained: next === undefined ? xp - floor : Math.min(xp - floor, next - floor),
    needed: next === undefined ? undefined : next - floor,
  };
}
export function qualityXp(
  best: Score,
  played: Score,
  definition: MasteryDefinition = FORK_MASTERY,
): { xp: number; lossCp?: number } {
  if (!Number.isFinite(best.value) || !Number.isFinite(played.value)) return { xp: 0 };
  if (best.type === 'cp' && played.type === 'cp') {
    const lossCp = Math.max(0, best.value - played.value);
    return {
      xp: definition.quality_awards.find((band) => lossCp <= band.max_loss_cp)?.xp ?? 0,
      lossCp,
    };
  }
  // Keep mate outcomes distinct from CP: retain/find a forced win, escape a
  // forced loss, or at least preserve its distance. Never reward losing a found
  // winning mate or shortening a forced loss.
  const acceptable =
    (played.type === 'mate' && played.value > 0) ||
    (best.type === 'mate' &&
      best.value < 0 &&
      (played.type === 'cp' || (played.value < 0 && played.value <= best.value)));
  return { xp: acceptable ? definition.quality_awards[0].xp : 0 };
}
export function tacticGrade(
  best: Score,
  played: Score,
  definition: MasteryDefinition = FORK_MASTERY,
): TacticalGrade | undefined {
  const quality = qualityXp(best, played, definition);
  if (!quality.xp) return;
  return quality.lossCp === undefined
    ? 'S+'
    : definition.grade_bands.find((band) => quality.lossCp! <= band.max_loss_cp)?.grade;
}
export const forkGrade = (best: Score, played: Score) => tacticGrade(best, played, FORK_MASTERY);
export function gradeForContribution(event: MasteryContribution): TacticalGrade | undefined {
  if (event.grade && TACTICAL_GRADES.includes(event.grade)) return event.grade;
  // Existing awards contain mover-relative engine evidence. Never infer grades
  // from their XP amount or require a browser checkpoint to recover them.
  const definition = MASTERIES.find((definition) => definition.id === event.masteryId);
  if (definition && event.evidence.ruleVersion === definition.rule_version)
    return tacticGrade(event.evidence.best, event.evidence.played, definition);
}
export function isHighGrade(grade: TacticalGrade | undefined): boolean {
  return grade === 'S-' || grade === 'S' || grade === 'S+';
}
export function withMasteryGrade(event: MasteryContribution): MasteryContribution {
  const grade = gradeForContribution(event);
  return event.grade === grade || !grade
    ? event
    : {
        ...event,
        grade,
        evidence: {
          ...event.evidence,
          gradeVersion: MASTERIES.find((definition) => definition.id === event.masteryId)!
            .grade_version,
        },
      };
}
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
): MasteryContribution[] {
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
  return [...forkEvents, ...skewerEvents];
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

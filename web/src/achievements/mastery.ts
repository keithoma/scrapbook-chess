import { parse } from 'yaml';
import source from '../../../data/achievements/masteries/tactics/forks.yml?raw';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import type { Score } from '../stockfish';
import {
  forkEngineEvidence,
  knightForkCandidates,
  type KnightForkCandidate,
} from '../tactics/knight-forks';
import { forkMaterialThreat, type MaterialThreat } from '../tactics/fork-material';

export const FORK_GRADES = [
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
export type ForkGrade = (typeof FORK_GRADES)[number];
interface MasteryDefinition {
  id: 'mastery_knight_forks';
  type: 'mastery';
  name: string;
  rule_version: string;
  grade_version: string;
  grade_bands: { grade: ForkGrade; max_loss_cp: number }[];
  quality_awards: { max_loss_cp: number; xp: number }[];
  level_thresholds: number[];
  level_requirements: { level: number; high_grade_count: number }[];
}
export const FORK_MASTERY = parse(source) as MasteryDefinition;
if (
  FORK_MASTERY.id !== 'mastery_knight_forks' ||
  FORK_MASTERY.type !== 'mastery' ||
  !FORK_MASTERY.rule_version ||
  !FORK_MASTERY.quality_awards?.length ||
  !FORK_MASTERY.grade_version ||
  FORK_MASTERY.grade_bands?.length !== FORK_GRADES.length ||
  FORK_MASTERY.grade_bands.some(
    (band, i, bands) =>
      band.grade !== FORK_GRADES[FORK_GRADES.length - 1 - i] ||
      !Number.isSafeInteger(band.max_loss_cp) ||
      band.max_loss_cp < 0 ||
      (i > 0 && band.max_loss_cp <= bands[i - 1].max_loss_cp),
  ) ||
  FORK_MASTERY.grade_bands.at(-1)?.max_loss_cp !==
    FORK_MASTERY.quality_awards.at(-1)?.max_loss_cp ||
  FORK_MASTERY.level_thresholds?.[0] !== 0 ||
  FORK_MASTERY.level_thresholds.some(
    (value, i, values) =>
      !Number.isSafeInteger(value) || value < 0 || (i > 0 && value <= values[i - 1]),
  ) ||
  !Array.isArray(FORK_MASTERY.level_requirements) ||
  FORK_MASTERY.level_requirements.some(
    (gate, i, gates) =>
      !Number.isSafeInteger(gate.level) ||
      gate.level < 2 ||
      gate.level > FORK_MASTERY.level_thresholds.length ||
      !Number.isSafeInteger(gate.high_grade_count) ||
      gate.high_grade_count < 1 ||
      (i > 0 && gate.level <= gates[i - 1].level),
  ) ||
  FORK_MASTERY.quality_awards.some(
    (band, i, bands) =>
      !Number.isSafeInteger(band.xp) ||
      band.xp <= 0 ||
      !Number.isSafeInteger(band.max_loss_cp) ||
      band.max_loss_cp < 0 ||
      (i > 0 && (band.max_loss_cp <= bands[i - 1].max_loss_cp || band.xp >= bands[i - 1].xp)),
  )
) {
  throw new Error('Invalid fork mastery definition.');
}
export interface MasteryContribution {
  kind: 'mastery';
  masteryId: 'mastery_knight_forks';
  amount: number;
  ply: number;
  grade?: ForkGrade; // Optional only for contributions saved before grades existed.
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
  };
}
export function masteryProgress(xp: number, highGrades = 0) {
  const thresholds = FORK_MASTERY.level_thresholds;
  const xpIndex = Math.max(0, thresholds.filter((threshold) => xp >= threshold).length - 1);
  let index = 0;
  let usedHighGrades = 0;
  for (let candidate = 1; candidate <= xpIndex; candidate++) {
    const gate = FORK_MASTERY.level_requirements.find((gate) => gate.level === candidate + 1);
    if (gate && highGrades < usedHighGrades + gate.high_grade_count) break;
    usedHighGrades += gate?.high_grade_count ?? 0;
    index = candidate;
  }
  const floor = thresholds[Math.max(0, index)];
  const next = thresholds[index + 1];
  const requiredHighGrades =
    FORK_MASTERY.level_requirements.find((gate) => gate.level === index + 2)?.high_grade_count ?? 0;
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
export function qualityXp(best: Score, played: Score): { xp: number; lossCp?: number } {
  if (!Number.isFinite(best.value) || !Number.isFinite(played.value)) return { xp: 0 };
  if (best.type === 'cp' && played.type === 'cp') {
    const lossCp = Math.max(0, best.value - played.value);
    return {
      xp: FORK_MASTERY.quality_awards.find((band) => lossCp <= band.max_loss_cp)?.xp ?? 0,
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
  return { xp: acceptable ? FORK_MASTERY.quality_awards[0].xp : 0 };
}
export function forkGrade(best: Score, played: Score): ForkGrade | undefined {
  const quality = qualityXp(best, played);
  if (!quality.xp) return;
  return quality.lossCp === undefined
    ? 'S+'
    : FORK_MASTERY.grade_bands.find((band) => quality.lossCp! <= band.max_loss_cp)?.grade;
}
export function gradeForContribution(event: MasteryContribution): ForkGrade | undefined {
  if (event.grade && FORK_GRADES.includes(event.grade)) return event.grade;
  // Existing awards contain mover-relative engine evidence. Never infer grades
  // from their XP amount or require a browser checkpoint to recover them.
  if (event.evidence.ruleVersion === 'knight-forks-v1')
    return forkGrade(event.evidence.best, event.evidence.played);
}
export function isHighGrade(grade: ForkGrade | undefined): boolean {
  return grade === 'S-' || grade === 'S' || grade === 'S+';
}
export function withForkGrade(event: MasteryContribution): MasteryContribution {
  const grade = gradeForContribution(event);
  return event.grade === grade || !grade
    ? event
    : {
        ...event,
        grade,
        evidence: { ...event.evidence, gradeVersion: FORK_MASTERY.grade_version },
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
  const evidence = forkEngineEvidence(fork, result);
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
const candidates = new WeakMap<ReplayGame, KnightForkCandidate[]>();
export function masteryContributions(
  game: ReplayGame,
  color: 'white' | 'black',
  checkpoint?: Checkpoint,
): MasteryContribution[] {
  let forks = candidates.get(game);
  if (!forks) {
    forks = knightForkCandidates(game);
    candidates.set(game, forks);
  }
  return forks
    .filter((fork) => fork.color === color)
    .flatMap((fork) => {
      const assessment = assessFork(game, fork, checkpoint);
      return assessment.status === 'qualified' ? [assessment.event] : [];
    });
}

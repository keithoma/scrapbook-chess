import { parse } from 'yaml';
import forkSource from '../../../data/achievements/masteries/tactics/forks.yml?raw';
import skewerSource from '../../../data/achievements/masteries/tactics/skewers.yml?raw';
import policySource from '../../../data/rules/tactical-mastery.yml?raw';
import openingPolicySource from '../../../data/rules/opening-mastery.yml?raw';
import openingSource from '../../../data/achievements/masteries/openings/jobava-london.yml?raw';
import type { Score } from '../stockfish';

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
export const MASTERY_IDS = ['mastery_knight_forks', 'mastery_skewers', 'mastery_rapport_jobava_white', 'mastery_rapport_jobava_black'] as const;
export type MasteryId = (typeof MASTERY_IDS)[number];
export interface MasteryDefinition {
  id: MasteryId;
  type: 'mastery';
  name: 'Knight forks' | 'Skewers' | 'The Modern Artist (Rapport-Jobava)' | 'The Art Critic (Defending the Rapport-Jobava)';
  family?: 'opening' | 'tactical';
  color?: 'white' | 'black';
  opening_id?: string;
  description?: string;
  rule_version: string;
  grade_version: string;
  grade_bands: { grade: TacticalGrade; max_loss_cp: number }[];
  quality_awards: { max_loss_cp: number; xp: number }[];
  level_thresholds: number[];
  level_requirements: { level: number; high_grade_count: number }[];
}
const policy = parse(policySource);
export const TACTICAL_MASTERIES: MasteryDefinition[] = [forkSource, skewerSource].map((source) => {
  const definition = parse(source);
  if (definition.progression !== policy.id)
    throw new Error('Unknown tactical mastery progression.');
  return { ...policy, ...definition };
});
export const FORK_MASTERY = TACTICAL_MASTERIES[0];
export const SKEWER_MASTERY = TACTICAL_MASTERIES[1];
export const OPENING_POLICY = parse(openingPolicySource);
export const OPENING_MASTERIES: MasteryDefinition[] = parse(openingSource).map((definition: MasteryDefinition & { progression: string }) => {
  if (definition.progression !== OPENING_POLICY.id || definition.opening_id !== 'rapport-jobava' ||
      !['white', 'black'].includes(definition.color ?? '') || definition.id !== `mastery_rapport_jobava_${definition.color}`)
    throw new Error('Invalid opening mastery definition.');
  return { ...OPENING_POLICY, ...definition, family: 'opening' };
});
export const MASTERIES = [...TACTICAL_MASTERIES, ...OPENING_MASTERIES];
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
  family?: 'tactical';
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
export interface OpeningMasteryContribution {
  kind: 'mastery';
  family: 'opening';
  masteryId: MasteryId;
  amount: number;
  ply: number;
  grade?: TacticalGrade;
  evidence: {
    ruleVersion: string;
    gradeVersion: string;
    analysisVersion: string;
    bookVersion: string;
    recognitionVersion: string;
    openingId: string;
    color: 'white' | 'black';
    inBook: boolean;
    lossCp?: number;
    theoryXp: number;
    performanceXp: number;
    bonusXp: number;
    decay: number;
    fade: number;
    capacity: number;
    peakAdvantageCp?: number;
    best: Score;
    played: Score;
    thinkingSeconds: number;
    timeMultiplier: number;
    resultMultiplier: number;
  };
}
export type AnyMasteryContribution = MasteryContribution | OpeningMasteryContribution;
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
export function gradeForContribution(event: AnyMasteryContribution): TacticalGrade | undefined {
  if (event.grade && TACTICAL_GRADES.includes(event.grade)) return event.grade;
  if (event.family === 'opening') return; // One explicit grade per game, never infer per-move grades.
  // Existing awards contain mover-relative engine evidence. Never infer grades
  // from their XP amount or require a browser checkpoint to recover them.
  const definition = MASTERIES.find((definition) => definition.id === event.masteryId);
  if (definition && event.evidence.ruleVersion === definition.rule_version)
    return tacticGrade(event.evidence.best, event.evidence.played, definition);
}
export function isHighGrade(grade: TacticalGrade | undefined): boolean {
  return grade === 'S-' || grade === 'S' || grade === 'S+';
}
export function withMasteryGrade(event: AnyMasteryContribution): AnyMasteryContribution {
  if (event.family === 'opening') return event;
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

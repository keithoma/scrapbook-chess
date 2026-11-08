import { parse } from 'yaml';
import forkSource from '../../../data/achievements/masteries/tactics/forks.yml?raw';
import skewerSource from '../../../data/achievements/masteries/tactics/skewers.yml?raw';
import policySource from '../../../data/rules/tactical-mastery.yml?raw';
import openingPolicySource from '../../../data/rules/opening-mastery.yml?raw';
import openingSource from '../../../data/achievements/masteries/openings/jobava-london.yml?raw';
import endgameSource from '../../../data/achievements/masteries/endgames/pawn-vs-pawn.yml?raw';
import endgamePolicySource from '../../../data/rules/endgame-mastery.yml?raw';
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
export const MASTERY_IDS = ['mastery_knight_forks', 'mastery_skewers', 'mastery_rapport_jobava_white', 'mastery_rapport_jobava_black', 'mastery_pawn_vs_pawn'] as const;
export type MasteryId = (typeof MASTERY_IDS)[number];
export interface MasteryDefinition {
  id: MasteryId;
  type: 'mastery';
  category?: string;
  subcategory?: string;
  name: 'Knight forks' | 'Skewers' | 'The Modern Artist (Rapport-Jobava)' | 'The Art Critic (Defending the Rapport-Jobava)' | 'Pawn vs Pawn';
  family?: 'opening' | 'tactical' | 'endgame';
  color?: 'white' | 'black';
  opening_id?: string;
  endgame_id?: string;
  description?: string;
  rule_version: string;
  grade_version: string;
  level_thresholds: number[];
  level_requirements: { level: number; high_grade_count: number }[];
}
export interface MoveMasteryDefinition extends MasteryDefinition {
  grade_bands: { grade: TacticalGrade; max_loss_cp: number }[];
  quality_awards: { max_loss_cp: number; xp: number }[];
}
const policy = parse(policySource);
export const TACTICAL_MASTERIES: MoveMasteryDefinition[] = [forkSource, skewerSource].map((source) => {
  const definition = parse(source);
  if (definition.progression !== policy.id)
    throw new Error('Unknown tactical mastery progression.');
  return { ...policy, ...definition };
});
export const FORK_MASTERY = TACTICAL_MASTERIES[0];
export const SKEWER_MASTERY = TACTICAL_MASTERIES[1];
interface OpeningPolicy extends Pick<MoveMasteryDefinition, 'quality_awards' | 'grade_bands' | 'level_thresholds' | 'level_requirements'> {
  id: string;
  theory_cap: number;
  novel_decay: number;
  advantage_start_cp: number;
  advantage_full_cp: number;
  conversion_capacity: number;
  fade_rate: number;
  fade_floor: number;
  conversion_bonus: number;
  conversion_max_loss_cp: number;
  minimum_grade_moves: number;
  clock_move_cap_seconds: number;
  control_cap_seconds: number;
  control_exponent: number;
  minimum_time_multiplier: number;
}
export const OPENING_POLICY: OpeningPolicy = parse(openingPolicySource);
for (const key of ['theory_cap', 'novel_decay', 'advantage_start_cp', 'advantage_full_cp',
  'conversion_capacity', 'fade_rate', 'fade_floor', 'conversion_bonus', 'conversion_max_loss_cp',
  'minimum_grade_moves', 'clock_move_cap_seconds', 'control_cap_seconds', 'control_exponent',
  'minimum_time_multiplier'] as const) {
  const value = OPENING_POLICY[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`Invalid opening mastery setting: ${key}`);
}
if (!(OPENING_POLICY.novel_decay > 0 && OPENING_POLICY.novel_decay < 1 &&
    OPENING_POLICY.fade_rate > 0 && OPENING_POLICY.fade_rate < 1 &&
    OPENING_POLICY.fade_floor > 0 && OPENING_POLICY.fade_floor < 1 &&
    OPENING_POLICY.advantage_full_cp > OPENING_POLICY.advantage_start_cp &&
    OPENING_POLICY.theory_cap > 0 && OPENING_POLICY.conversion_capacity > 0 &&
    Number.isSafeInteger(OPENING_POLICY.minimum_grade_moves) && OPENING_POLICY.minimum_grade_moves >= 4 && OPENING_POLICY.clock_move_cap_seconds > 0 &&
    OPENING_POLICY.control_cap_seconds > 0 && OPENING_POLICY.control_exponent > 1 &&
    OPENING_POLICY.minimum_time_multiplier > 0))
  throw new Error('Invalid opening mastery policy.');
export const OPENING_MASTERIES: MoveMasteryDefinition[] = parse(openingSource).map((definition: MoveMasteryDefinition & { progression: string }) => {
  if (definition.progression !== OPENING_POLICY.id || definition.opening_id !== 'rapport-jobava' ||
      !['white', 'black'].includes(definition.color ?? '') || definition.id !== `mastery_rapport_jobava_${definition.color}`)
    throw new Error('Invalid opening mastery definition.');
  return { ...OPENING_POLICY, ...definition, family: 'opening' };
});
export type EndgameStart = 'winning' | 'even' | 'losing';
export type EndgameResult = 'win' | 'draw' | 'loss';
interface EndgamePolicy {
  id: string;
  progression: string;
  even_cp: number;
  max_xp: number;
  quality_floor: number;
  average_loss_weight: number;
  worst_loss_weight: number;
  outcome_scores: Record<EndgameStart, Record<EndgameResult, number>>;
  grade_scores: { grade: TacticalGrade; min_score: number }[];
}
export const ENDGAME_POLICY: EndgamePolicy = parse(endgamePolicySource);
if (ENDGAME_POLICY.progression !== policy.id ||
    !Number.isFinite(ENDGAME_POLICY.even_cp) || ENDGAME_POLICY.even_cp < 0 ||
    !Number.isSafeInteger(ENDGAME_POLICY.max_xp) || ENDGAME_POLICY.max_xp <= 0 ||
    !(ENDGAME_POLICY.quality_floor > 0 && ENDGAME_POLICY.quality_floor < 1) ||
    ![ENDGAME_POLICY.average_loss_weight, ENDGAME_POLICY.worst_loss_weight].every(value => Number.isFinite(value) && value > 0) ||
    ENDGAME_POLICY.grade_scores?.length !== TACTICAL_GRADES.length ||
    ENDGAME_POLICY.grade_scores.some((band, i, bands) =>
      band.grade !== TACTICAL_GRADES[TACTICAL_GRADES.length - 1 - i] ||
      !Number.isFinite(band.min_score) || band.min_score < 0 || band.min_score > 100 ||
      (i > 0 && band.min_score >= bands[i - 1].min_score)) ||
    ENDGAME_POLICY.grade_scores.at(-1)?.min_score !== 0)
  throw new Error('Invalid endgame mastery policy.');
for (const start of ['winning', 'even', 'losing'] as const) {
  const scores = ENDGAME_POLICY.outcome_scores?.[start];
  if (!scores || ![scores.win, scores.draw, scores.loss].every(value => Number.isFinite(value) && value > 0) ||
      scores.win <= scores.draw || scores.draw <= scores.loss ||
      (start === 'even' && scores.win * ENDGAME_POLICY.quality_floor <= scores.draw))
    throw new Error('Invalid endgame outcome scores.');
}
for (const result of ['win', 'draw', 'loss'] as const) {
  const scores = ENDGAME_POLICY.outcome_scores;
  if (!(scores.winning[result] < scores.even[result] && scores.even[result] < scores.losing[result]))
    throw new Error('Harder starting positions must improve the endgame outcome score.');
}
export const ENDGAME_MASTERIES: MasteryDefinition[] = [parse(endgameSource)].map(definition => {
  if (definition.progression !== ENDGAME_POLICY.id || definition.endgame_id !== 'pawn-vs-pawn' ||
      definition.id !== 'mastery_pawn_vs_pawn') throw new Error('Invalid endgame mastery definition.');
  return { ...definition, family: 'endgame', level_thresholds: policy.level_thresholds, level_requirements: policy.level_requirements };
});
export const PAWN_VS_PAWN_MASTERY = ENDGAME_MASTERIES[0];
export const MASTERIES: MasteryDefinition[] = [...TACTICAL_MASTERIES, ...OPENING_MASTERIES, ...ENDGAME_MASTERIES];
for (const definition of [...TACTICAL_MASTERIES, ...OPENING_MASTERIES]) {
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
    definition.quality_awards.some(
      (band, i, bands) =>
        !Number.isSafeInteger(band.xp) ||
        band.xp <= 0 ||
        !Number.isSafeInteger(band.max_loss_cp) ||
        band.max_loss_cp < 0 ||
        (i > 0 && (band.max_loss_cp <= bands[i - 1].max_loss_cp || band.xp >= bands[i - 1].xp)),
    )
  ) throw new Error('Invalid move mastery definition.');
}
for (const definition of MASTERIES) {
  if (!MASTERY_IDS.includes(definition.id) || definition.type !== 'mastery' ||
    !definition.rule_version || !definition.grade_version ||
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
    )
  ) {
    throw new Error('Invalid mastery progression.');
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
export interface EndgameMasteryContribution {
  kind: 'mastery';
  family: 'endgame';
  masteryId: MasteryId;
  amount: number;
  ply: number;
  grade?: TacticalGrade;
  evidence: {
    ruleVersion: string;
    gradeVersion: string;
    analysisVersion: string;
    endgameId: string;
    startPly: number;
    startingEvaluation: Score;
    startingPosition: EndgameStart;
    result: EndgameResult;
    ownMoves: number;
    averageChanceLoss: number;
    worstChanceLoss: number;
    quality: number;
    outcomeScore: number;
    score: number;
  };
}
export type AnyMasteryContribution = MasteryContribution | OpeningMasteryContribution | EndgameMasteryContribution;
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
  definition: MoveMasteryDefinition = FORK_MASTERY,
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
  definition: MoveMasteryDefinition = FORK_MASTERY,
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
  if (event.family === 'opening' || event.family === 'endgame') return; // Whole-game grades are explicit.
  // Existing awards contain mover-relative engine evidence. Never infer grades
  // from their XP amount or require a browser checkpoint to recover them.
  const definition = TACTICAL_MASTERIES.find((definition) => definition.id === event.masteryId);
  if (definition && event.evidence.ruleVersion === definition.rule_version)
    return tacticGrade(event.evidence.best, event.evidence.played, definition);
}
export function isHighGrade(grade: TacticalGrade | undefined): boolean {
  return grade === 'S-' || grade === 'S' || grade === 'S+';
}
export function withMasteryGrade(event: AnyMasteryContribution): AnyMasteryContribution {
  if (event.family === 'opening' || event.family === 'endgame') return event;
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

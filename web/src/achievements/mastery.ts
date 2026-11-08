import { parse } from 'yaml';
import source from '../../../data/achievements/masteries/knight_forks.yml?raw';
import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import type { Score } from '../stockfish';
import { forkEngineEvidence, knightForkCandidates, type KnightForkCandidate } from '../tactics/knight-forks';
import { forkMaterialThreat, type MaterialThreat } from '../tactics/fork-material';

interface MasteryDefinition {
  id: 'mastery_knight_forks'; type: 'mastery'; name: string; rule_version: string;
  quality_awards: { max_loss_cp: number; xp: number }[];
  level_thresholds: number[];
}
export const FORK_MASTERY = parse(source) as MasteryDefinition;
if (FORK_MASTERY.id !== 'mastery_knight_forks' || FORK_MASTERY.type !== 'mastery'
    || !FORK_MASTERY.rule_version || !FORK_MASTERY.quality_awards?.length
    || FORK_MASTERY.level_thresholds?.[0] !== 0
    || FORK_MASTERY.level_thresholds.some((value, i, values) => !Number.isSafeInteger(value) || value < 0 || (i > 0 && value <= values[i - 1]))
    || FORK_MASTERY.quality_awards.some((band, i, bands) => !Number.isSafeInteger(band.xp) || band.xp <= 0
      || !Number.isSafeInteger(band.max_loss_cp) || band.max_loss_cp < 0
      || (i > 0 && (band.max_loss_cp <= bands[i - 1].max_loss_cp || band.xp >= bands[i - 1].xp)))) {
  throw new Error('Invalid fork mastery definition.');
}
export interface MasteryContribution {
  kind: 'mastery'; masteryId: 'mastery_knight_forks'; amount: number; ply: number;
  evidence: { ruleVersion: string; best: Score; played: Score; bestMove: string; lossCp?: number;
    materialGainCp: number; reply: string; capture: string };
}
export function masteryProgress(xp: number) {
  const thresholds = FORK_MASTERY.level_thresholds;
  const index = thresholds.filter(threshold => xp >= threshold).length - 1;
  const floor = thresholds[Math.max(0, index)];
  const next = thresholds[index + 1];
  return { xp, level: Math.max(0, index) + 1, floor, next,
    gained: xp - floor, needed: next === undefined ? undefined : next - floor };
}
export function qualityXp(best: Score, played: Score): { xp: number; lossCp?: number } {
  if (!Number.isFinite(best.value) || !Number.isFinite(played.value)) return { xp: 0 };
  if (best.type === 'cp' && played.type === 'cp') {
    const lossCp = Math.max(0, best.value - played.value);
    return { xp: FORK_MASTERY.quality_awards.find(band => lossCp <= band.max_loss_cp)?.xp ?? 0, lossCp };
  }
  // Keep mate outcomes distinct from CP: retain/find a forced win, escape a
  // forced loss, or at least preserve its distance. Never reward losing a found
  // winning mate or shortening a forced loss.
  const acceptable = (played.type === 'mate' && played.value > 0)
    || (best.type === 'mate' && best.value < 0 && (played.type === 'cp'
      || (played.value < 0 && played.value <= best.value)));
  return { xp: acceptable ? FORK_MASTERY.quality_awards[0].xp : 0 };
}
export type ForkAssessment = { material: MaterialThreat; status: 'pending' | 'rejected' }
  | { material: Extract<MaterialThreat, { status: 'qualified' }>; status: 'qualified'; event: MasteryContribution };
export function assessFork(game: ReplayGame, fork: KnightForkCandidate, checkpoint?: Checkpoint): ForkAssessment {
  const material = forkMaterialThreat(game, fork);
  if (material.status !== 'qualified') return { material, status: material.status === 'unresolved' ? 'pending' : 'rejected' };
  const result = checkpoint?.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
    ? checkpoint.results.find(result => result.ply === fork.ply) : undefined;
  const evidence = forkEngineEvidence(fork, result);
  if (!evidence) return { material, status: 'pending' };
  const quality = qualityXp(evidence.best, evidence.played);
  if (!quality.xp) return { material, status: 'rejected' };
  return { material, status: 'qualified', event: {
    kind: 'mastery', masteryId: FORK_MASTERY.id, amount: quality.xp, ply: fork.ply,
    evidence: { ruleVersion: FORK_MASTERY.rule_version, best: evidence.best, played: evidence.played, bestMove: evidence.bestMove,
      lossCp: quality.lossCp, materialGainCp: material.gainCp, reply: material.reply, capture: material.capture },
  } };
}
const candidates = new WeakMap<ReplayGame, KnightForkCandidate[]>();
export function masteryContributions(game: ReplayGame, color: 'white' | 'black', checkpoint?: Checkpoint): MasteryContribution[] {
  let forks = candidates.get(game);
  if (!forks) { forks = knightForkCandidates(game); candidates.set(game, forks); }
  return forks.filter(fork => fork.color === color).flatMap(fork => {
    const assessment = assessFork(game, fork, checkpoint);
    return assessment.status === 'qualified' ? [assessment.event] : [];
  });
}

import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { EnginePick } from '../stockfish';
import { BOOK_MOVE_RULE, bookStatistics } from './book-policy';
import type { BookMoveEvidence } from '../openings/book';
import { balance } from '../tactics/material';
import { quality, pov } from './quality';
import { MATERIAL_VALUES } from './material-values';
export { MATERIAL_VALUES } from './material-values';

export const CLEAN_GAIN_RULE = {
  version: 'clean-gains-v2',
  evaluationPerPawnCp: 80,
  maximumTrapWinRate: 0.3,
  // Search limits and stability tolerances are conservative prototype tuning.
  depths: [10, 14, 18, 22],
  minimumDepth: 14,
  scoreToleranceCp: 20,
  relativeScoreTolerance: 0.2,
  quietTailPlies: 4,
  maximumLinePlies: 64,
  maximumExtensionPlies: 16,
  lookbackPlies: 24,
  gameNodeBudget: 300_000,
} as const;

export interface CleanGainCandidate { capturePly: number; concessionPly: number }
export interface CleanGainSample {
  depth: number;
  before: EnginePick;
  conceded: EnginePick;
  captureBest: EnginePick;
  after: EnginePick;
}
export interface CleanGainAttempt extends CleanGainCandidate { samples: CleanGainSample[] }
export interface CleanGainEvidence {
  ruleVersion: string;
  capturePly: number;
  attempts: CleanGainAttempt[];
  budgetExhausted?: boolean;
}
export type BookLookup = (position: Chess, move: NonNullable<ReturnType<typeof parseUci>>) => BookMoveEvidence | undefined;
export interface CleanGainAssessment {
  status: 'qualified' | 'rejected' | 'pending';
  reason: string;
  concessionPly?: number;
  evaluationGainCp?: number;
  materialGainCp?: number;
  requiredCp?: number;
  depth?: number;
}

export function cleanGainBookGate(evidence?: BookMoveEvidence): 'outside' | 'excluded' | 'trap' {
  if (!evidence || evidence.weight <= 0) return 'outside';
  // Reuse the shared observation requirement. A quality failure does not turn
  // a reference move into an unrecognized move for this exclusion.
  const { games, winRate } = bookStatistics(evidence);
  return games !== undefined && games >= BOOK_MOVE_RULE.minimumGames && winRate !== undefined &&
    winRate < CLEAN_GAIN_RULE.maximumTrapWinRate ? 'trap' : 'excluded';
}

export function candidateBookGate(game: ReplayGame, candidate: CleanGainCandidate, lookup: BookLookup) {
  // Both accepting established theory and giving material in theory are gated.
  // The opponent's losing line must have the poor win rate for either exception.
  const concession = Chess.fromSetup(parseFen(game.frames[candidate.concessionPly - 1].fen).unwrap()).unwrap();
  const capture = Chess.fromSetup(parseFen(game.frames[candidate.capturePly - 1].fen).unwrap()).unwrap();
  const losing = lookup(concession, normalizeMove(concession, parseUci(game.moves[candidate.concessionPly - 1].uci)!));
  const taking = lookup(capture, normalizeMove(capture, parseUci(game.moves[candidate.capturePly - 1].uci)!));
  const gate = cleanGainBookGate(losing);
  return (taking?.weight ?? 0) > 0 && gate !== 'trap' ? 'excluded' : gate;
}

export function cleanGainCandidates(game: ReplayGame, capturePly: number): CleanGainCandidate[] {
  const capture = game.moves[capturePly - 1];
  if (!capture?.captured) return [];
  const after = Chess.fromSetup(parseFen(game.frames[capturePly].fen).unwrap()).unwrap();
  const candidates: CleanGainCandidate[] = [];
  for (let ply = capturePly - 1; ply >= Math.max(1, capturePly - CLEAN_GAIN_RULE.lookbackPlies); ply--) {
    if (game.moves[ply - 1].color === capture.color) continue;
    const before = Chess.fromSetup(parseFen(game.frames[ply - 1].fen).unwrap()).unwrap();
    // The actual game must already have delivered the full role's net value.
    if (balance(after, capture.color) - balance(before, capture.color) >= MATERIAL_VALUES[capture.captured])
      candidates.push({ capturePly, concessionPly: ply });
  }
  return candidates;
}

export interface MaterialLine { settled: boolean; gainCp: number; quietPlies: number; plies: number }
export function materialLine(fen: string, pick: EnginePick, color: Color, baselineCp: number): MaterialLine | undefined {
  if (!pick.pv?.length || pick.pv.length > CLEAN_GAIN_RULE.maximumLinePlies || pick.pv[0] !== pick.uci) return;
  try {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    let quietPlies = 0;
    let material = balance(position, color);
    for (const uci of pick.pv) {
      const move = parseUci(uci);
      if (position.isEnd() || !move || !position.isLegal(move)) return;
      const wasCheck = position.isCheck();
      position.play(move);
      const next = balance(position, color);
      quietPlies = !wasCheck && !position.isCheck() && next === material ? quietPlies + 1 : 0;
      material = next;
    }
    // Mate is not a settled material gain. Terminal lines without an ongoing
    // material position cannot establish a retainable pawn or piece either.
    return {
      settled: !position.isEnd() && quietPlies >= CLEAN_GAIN_RULE.quietTailPlies,
      gainCp: material - baselineCp, quietPlies, plies: pick.pv.length,
    };
  } catch { return; }
}

function finitePick(pick: EnginePick, depth: number): boolean {
  return !!pick && pick.depth >= depth && pick.depth <= 256 && Number.isInteger(pick.depth) &&
    !!pick.score && pick.score.type === 'cp' && Number.isFinite(pick.score.value) &&
    Math.abs(pick.score.value) <= 1_000_000;
}

export function assessCleanGainAttempt(game: ReplayGame, attempt: CleanGainAttempt, lookup: BookLookup): CleanGainAssessment {
  const pending = (reason: string): CleanGainAssessment => ({ status: 'pending', reason });
  const capture = game.moves[attempt.capturePly - 1];
  if (!capture?.captured || !Number.isInteger(attempt.concessionPly) || attempt.concessionPly < 1 ||
      attempt.concessionPly >= attempt.capturePly || attempt.capturePly - attempt.concessionPly > CLEAN_GAIN_RULE.lookbackPlies ||
      game.moves[attempt.concessionPly - 1].color === capture.color) return pending('invalid-candidate');
  if (candidateBookGate(game, attempt, lookup) === 'excluded') return { status: 'rejected', reason: 'book' };
  const baseline = balance(Chess.fromSetup(parseFen(game.frames[attempt.concessionPly - 1].fen).unwrap()).unwrap(), capture.color);
  const actual = balance(Chess.fromSetup(parseFen(game.frames[attempt.capturePly].fen).unwrap()).unwrap(), capture.color) - baseline;
  const value = MATERIAL_VALUES[capture.captured];
  const requiredCp = value * CLEAN_GAIN_RULE.evaluationPerPawnCp / MATERIAL_VALUES.pawn;
  if (actual < value) return { status: 'rejected', reason: 'trade', materialGainCp: actual, requiredCp };
  let previous: { gain: number; conceded: number; material: number; verdict: string; depth: number } | undefined;
  let latest: CleanGainAssessment = pending('insufficient-search');
  for (const sample of attempt.samples) {
    if (!CLEAN_GAIN_RULE.depths.includes(sample.depth as 10) ||
        ![sample.before, sample.conceded, sample.captureBest, sample.after].every(pick => finitePick(pick, sample.depth))) {
      previous = undefined; latest = pending('invalid-or-mate-evidence'); continue;
    }
    // Validate complete legal lines, including the baseline and capture search.
    const before = materialLine(game.frames[attempt.concessionPly - 1].fen, sample.before, capture.color, baseline);
    const captureBest = materialLine(game.frames[attempt.capturePly - 1].fen, sample.captureBest, capture.color, baseline);
    const conceded = materialLine(game.frames[attempt.concessionPly].fen, sample.conceded, capture.color, baseline);
    const after = materialLine(game.frames[attempt.capturePly].fen, sample.after, capture.color, baseline);
    if (!before || !captureBest || !conceded || !after) {
      previous = undefined; latest = pending('invalid-line'); continue;
    }
    const sign = capture.color === 'white' ? 1 : -1;
    const gain = sign * (sample.after.score.value - sample.before.score.value);
    const concessionGain = sign * (sample.conceded.score.value - sample.before.score.value);
    const material = Math.min(actual, after.gainCp, conceded.gainCp);
    const cleanCapture = quality(pov(sample.captureBest.score, capture.color), pov(sample.after.score, capture.color)) === 'clean';
    const verdict = gain < requiredCp || concessionGain < requiredCp ? 'compensation'
      : !cleanCapture ? 'capture-quality'
      : !conceded.settled || !after.settled ? 'unsettled-line'
      : material < value ? 'material-returned' : 'qualified';
    latest = { status: 'pending', reason: verdict === 'qualified' ? 'search-disagreement' : verdict,
      concessionPly: attempt.concessionPly, evaluationGainCp: Math.min(gain, concessionGain), materialGainCp: material, requiredCp, depth: sample.depth };
    const consecutive = previous && CLEAN_GAIN_RULE.depths.indexOf(sample.depth as 10) === CLEAN_GAIN_RULE.depths.indexOf(previous.depth as 10) + 1;
    const stableScore = (a: number, b: number) => Math.abs(a - b) <= Math.max(CLEAN_GAIN_RULE.scoreToleranceCp,
      Math.min(Math.abs(a), Math.abs(b)) * CLEAN_GAIN_RULE.relativeScoreTolerance);
    if (previous && consecutive && sample.depth >= CLEAN_GAIN_RULE.minimumDepth && previous.verdict === verdict &&
        stableScore(previous.gain, gain) && stableScore(previous.conceded, concessionGain) && previous.material === material) {
      if (verdict === 'qualified') return { ...latest, status: 'qualified', reason: 'settled' };
      if (['compensation', 'capture-quality', 'material-returned'].includes(verdict)) return { ...latest, status: 'rejected' };
    }
    previous = { gain, conceded: concessionGain, material, verdict, depth: sample.depth };
  }
  return latest;
}

export function assessCleanGain(game: ReplayGame, evidence: CleanGainEvidence | undefined, lookup: BookLookup): CleanGainAssessment {
  if (!evidence || evidence.ruleVersion !== CLEAN_GAIN_RULE.version)
    return { status: 'pending', reason: 'analysis-required' };
  if (!validCleanGainEvidence(game, evidence)) return { status: 'pending', reason: 'invalid-evidence' };
  let rejected: CleanGainAssessment | undefined;
  let pending: CleanGainAssessment | undefined;
  for (const attempt of evidence.attempts) {
    if (attempt.capturePly !== evidence.capturePly) return { status: 'pending', reason: 'invalid-candidate' };
    const result = assessCleanGainAttempt(game, attempt, lookup);
    if (result.status === 'qualified') return result;
    if (result.status === 'pending') pending = result;
    else rejected = result;
  }
  return evidence.budgetExhausted ? { status: 'pending', reason: 'analysis-budget' }
    : pending ?? rejected ?? { status: 'pending', reason: 'no-concession-baseline' };
}

export function validCleanGainEvidence(game: ReplayGame, value: unknown): value is CleanGainEvidence {
  try {
    const evidence = value as CleanGainEvidence;
    if (!evidence || (evidence.budgetExhausted !== undefined && typeof evidence.budgetExhausted !== 'boolean') ||
        evidence.ruleVersion !== CLEAN_GAIN_RULE.version || !Number.isInteger(evidence.capturePly) ||
        !game.moves[evidence.capturePly - 1]?.captured || !Array.isArray(evidence.attempts) ||
        evidence.attempts.length > CLEAN_GAIN_RULE.lookbackPlies / 2) return false;
    const candidates = cleanGainCandidates(game, evidence.capturePly);
    const seen = new Set<number>();
    for (const attempt of evidence.attempts) {
      if (!attempt || attempt.capturePly !== evidence.capturePly || seen.has(attempt.concessionPly) ||
          !candidates.some(candidate => candidate.concessionPly === attempt.concessionPly) ||
          !Array.isArray(attempt.samples) || attempt.samples.length > CLEAN_GAIN_RULE.depths.length) return false;
      seen.add(attempt.concessionPly);
      for (const [i, sample] of attempt.samples.entries()) {
        if (!sample || sample.depth !== CLEAN_GAIN_RULE.depths[i]) return false;
        for (const [field, board] of [
          ['before', attempt.concessionPly - 1], ['conceded', attempt.concessionPly],
          ['captureBest', attempt.capturePly - 1], ['after', attempt.capturePly],
        ] as const) {
          const pick = sample[field];
          if (!pick || pick.depth !== sample.depth || !pick.score || !['cp', 'mate'].includes(pick.score.type) ||
              !Number.isFinite(pick.score.value) || Math.abs(pick.score.value) > 1_000_000 ||
              !materialLine(game.frames[board].fen, pick, game.moves[evidence.capturePly - 1].color, 0)) return false;
        }
      }
    }
    return true;
  } catch { return false; }
}

export function mergeCleanGainEvidence(previous?: CleanGainEvidence[], current?: CleanGainEvidence[]) {
  if (!previous && !current) return;
  const merged = new Map(previous?.map(evidence => [evidence.capturePly, evidence]));
  for (const evidence of current ?? []) {
    const saved = merged.get(evidence.capturePly);
    if (!evidence.budgetExhausted || !saved || saved.budgetExhausted) merged.set(evidence.capturePly, evidence);
  }
  return [...merged.values()].sort((a, b) => a.capturePly - b.capturePly);
}

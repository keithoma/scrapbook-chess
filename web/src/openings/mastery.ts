import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import { validAnalysis, pov } from '../achievements/quality';
import {
  OPENING_POLICY as policy, OPENING_MASTERIES, qualityXp,
  type OpeningMasteryContribution, type TacticalGrade,
} from '../achievements/mastery-policy';
import type { Score } from '../stockfish';
import { recognizeOpening } from './recognition';
import { BOOK_VERSION } from './book';
import { annotateMoves } from '../chess/annotations';
import { openingClocks, openingTimeMultiplier } from './time';

// Scores are objective White POV. A forced mate is categorical, never a CP distance.
const magnitude = (score: Score) => score.type === 'cp' ? Math.abs(score.value) : Infinity;
function favorable(score: Score, color: Color): number {
  const own = pov(score, color);
  return own.type === 'cp' ? own.value : own.value > 0 ? Infinity : -Infinity;
}
export const advantageSignal = (cp: number): number =>
  Math.max(0, Math.min(1, (cp - policy.advantage_start_cp) / (policy.advantage_full_cp - policy.advantage_start_cp)));
export const openingFade = (capacity: number): number =>
  capacity <= policy.conversion_capacity ? 1 : Math.max(policy.fade_floor, policy.fade_rate ** (capacity - policy.conversion_capacity));

export function openingAssessment(game: ReplayGame, color: Color, checkpoint?: Checkpoint) {
  const opening = recognizeOpening(game);
  if (!opening) return { status: 'unrecognized' as const, events: [] };
  if (!validAnalysis(game, checkpoint, true)) return { status: 'analysis' as const, events: [] };
  const clocks = openingClocks(game, color);
  if (!clocks) return { status: 'clocks' as const, events: [] };
  const definition = OPENING_MASTERIES.find(d => d.opening_id === opening.id && d.color === color)!;
  const events: OpeningMasteryContribution[] = [];
  let peak = 0; let capacity = 0; let outside = false; let sinceDeparture = 0;
  let bookCount = 0; let theoryTotal = 0; let creditedTime = 0;
  let gradeMoves = 0; let gradeWeight = 0; let weightedLoss = 0; let badMate = false;
  const visited = new Set<string>();
  const results = annotateMoves(game, checkpoint.results);
  const resultMultiplier = game.result === '1/2-1/2' ? 1 : game.result === (color === 'white' ? '1-0' : '0-1') ? 2 : 0.5;
  for (const [i, move] of game.moves.entries()) {
    const result = results[i];
    const own = move.color === color;
    const best = pov(result.best, move.color); const played = pov(result.played, move.color);
    const quality = game.frames[i + 1].checkmate ? { xp: definition.quality_awards[0].xp, lossCp: undefined } : qualityXp(best, played, definition);
    const book = result.annotations!.book;
    const inBook = book.status === 'book';
    const positionKey = game.frames[i].fen.split(' ').slice(0, 4).join(' ');
    const repeated = visited.has(positionKey);
    visited.add(positionKey);
    // Unknown evidence establishes neither theory nor a departure from theory.
    if (book.status === 'outside') outside = true;
    peak = Math.max(peak, magnitude(result.best));
    if (!own) continue;
    capacity += advantageSignal(peak);
    const fade = openingFade(capacity);
    const decay = outside ? policy.novel_decay ** sinceDeparture++ : 1;
    const seconds = clocks.seconds.get(move.ply)!;
    // At the floor, padding the clock cannot enlarge the time multiplier.
    creditedTime += seconds * Math.max(0, (fade - policy.fade_floor) / (1 - policy.fade_floor));
    let theoryXp = 0; let performanceXp = 0; let bonusXp = 0;
    if (inBook && !repeated) {
      const award = (2 * ++bookCount + 1) * quality.xp / definition.quality_awards[0].xp;
      theoryXp = Math.max(0, Math.min(award, policy.theory_cap - theoryTotal));
      theoryTotal += theoryXp;
    } else if (book.status === 'outside' && !repeated) {
      performanceXp = quality.xp * decay;
      const precise = quality.xp > 0 && (quality.lossCp === undefined || quality.lossCp <= policy.conversion_max_loss_cp);
      const retained = Math.min(favorable(result.best, color), game.frames[i + 1].checkmate ? Infinity : favorable(result.played, color));
      if (precise) bonusXp = performanceXp * policy.conversion_bonus * advantageSignal(retained) * fade;
      const weight = decay * fade;
      gradeWeight += weight;
      // Errors remain in the grade even when they award no XP.
      weightedLoss += (quality.lossCp ?? 0) * weight;
      if (quality.lossCp === undefined && !quality.xp) badMate = true;
      if (quality.xp > 0 && fade > policy.fade_floor) gradeMoves++;
    }
    events.push({
      kind: 'mastery', family: 'opening', masteryId: definition.id, amount: 0, ply: move.ply,
      evidence: {
        ruleVersion: definition.rule_version, gradeVersion: definition.grade_version,
        analysisVersion: checkpoint.version, bookVersion: BOOK_VERSION,
        recognitionVersion: opening.sourceVersion, openingId: opening.id, color,
        inBook, lossCp: quality.lossCp, theoryXp, performanceXp, bonusXp, decay, fade, capacity,
        peakAdvantageCp: Number.isFinite(peak) ? peak : undefined,
        best, played, thinkingSeconds: seconds, timeMultiplier: 0, resultMultiplier,
      },
    });
  }
  const timeMultiplier = openingTimeMultiplier(clocks.nominal, creditedTime);
  const raw = events.map(event => {
    const e = event.evidence;
    e.timeMultiplier = timeMultiplier;
    return (e.theoryXp + e.performanceXp + e.bonusXp) * e.fade * timeMultiplier * resultMultiplier;
  });
  // Round only the track total; largest remainders allocate XP deterministically for replay.
  const sum = raw.reduce((a, b) => a + b, 0);
  const target = sum > 0 ? Math.max(1, Math.round(sum)) : 0;
  events.forEach((event, i) => { event.amount = Math.floor(raw[i]); });
  const remainder = target - events.reduce((sum, event) => sum + event.amount, 0);
  const order = raw.map((value, i) => ({ i, part: value - Math.floor(value) }))
    .sort((a, b) => b.part - a.part || a.i - b.i);
  for (let i = 0; i < remainder; i++) events[order[i].i].amount++;
  let grade: TacticalGrade | undefined;
  if (gradeMoves >= policy.minimum_grade_moves && gradeWeight > 0) {
    grade = badMate ? 'D-' : definition.grade_bands.find(b => weightedLoss / gradeWeight <= b.max_loss_cp)?.grade ?? 'D-';
    events.at(-1)!.grade = grade;
  }
  return { status: 'ready' as const, events: events.filter(e => e.amount > 0 || e.grade), grade, opening };
}

export function openingContributions(game: ReplayGame, color: Color, checkpoint?: Checkpoint): OpeningMasteryContribution[] {
  return openingAssessment(game, color, checkpoint).events;
}

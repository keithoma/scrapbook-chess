import { expect, it } from 'vitest';
import { parseGame, type ReplayGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import pawnPgn from '../fixtures/games/pawn-vs-pawn.pgn?raw';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import { endgameContributions, pawnEndgameAssessment } from './mastery';
import {
  ENDGAME_POLICY, PAWN_VS_PAWN_MASTERY, TACTICAL_GRADES,
  gradeForContribution, masteryContributions, masteryProgress, type EndgameMasteryContribution,
} from '../achievements/mastery';
import { prepareGrant, projectCollection, retainMastery } from '../achievements/collection';

const fen = '7k/6p1/8/8/8/8/1P6/K7 w - - 0 1';
function game(result = '1-0') {
  return parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n[Result "${result}"]\n\n1. Kb1 Kh7 2. Kc2 Kg6 3. Kd3 Kf5 ${result}`);
}
function award(g: ReplayGame, cp = analyzed(g), color: 'white' | 'black' = 'white'): EndgameMasteryContribution {
  const state = pawnEndgameAssessment(g, color, cp);
  expect(state.status).toBe('ready');
  if (state.status !== 'ready') throw new Error(`Unexpected endgame state: ${state.status}`);
  return state.event;
}
const rank = (event: EndgameMasteryContribution) => TACTICAL_GRADES.indexOf(event.grade!);

it('awards one whole-game grade and XP, independently of tactical tracks and move count', () => {
  const g = game();
  const events = masteryContributions(g, 'white', analyzed(g));
  expect(events).toHaveLength(1);
  const event = award(g);
  expect(event).toMatchObject({
    masteryId: 'mastery_pawn_vs_pawn', family: 'endgame', ply: g.moves.length, grade: 'S-',
    evidence: { startPly: 0, ownMoves: 3, startingPosition: 'even', result: 'win', quality: 1, analysisVersion: ANALYSIS_VERSION },
  });
  expect(event.amount).toBeGreaterThan(0);
  const long = parseGame(g.pgn.replace('3. Kd3 Kf5', '3. Kd3 Kf5 4. Kc2 Kg6 5. Kd3 Kf5'));
  expect(award(long).amount).toBe(event.amount);
});

it('rewards a comeback win above an equal-start win above an already-winning conversion', () => {
  const g = game();
  const losing = award(g, analyzed(g, -400));
  const even = award(g);
  const winning = award(g, analyzed(g, 400));
  expect(losing.amount).toBeGreaterThan(even.amount);
  expect(even.amount).toBeGreaterThan(winning.amount);
  expect(rank(losing)).toBeGreaterThan(rank(even));
  expect(rank(even)).toBeGreaterThan(rank(winning));
  expect(losing.grade).toBe('S+');
});

it('makes winning from equality more important than perfect move quality in a draw or loss', () => {
  const win = game();
  const poor = analyzed(win);
  for (const result of poor.results.filter(result => result.ply % 2)) result.played.value = -10_000;
  const winner = award(win, poor);
  const draw = award(game('1/2-1/2'));
  const loss = award(game('0-1'));
  expect(winner.evidence.quality).toBe(0);
  expect(winner.amount).toBeGreaterThan(draw.amount);
  expect(rank(winner)).toBeGreaterThan(rank(draw));
  expect(draw.amount).toBeGreaterThan(loss.amount);
  expect(rank(draw)).toBeGreaterThan(rank(loss));
});

it('rewards saving a losing ending and reduces credit for drawing an already-winning one', () => {
  const g = game('1/2-1/2');
  const saved = award(g, analyzed(g, -400));
  const held = award(g);
  const squandered = award(g, analyzed(g, 400));
  expect(saved.amount).toBeGreaterThan(held.amount);
  expect(held.amount).toBeGreaterThan(squandered.amount);
  expect(rank(saved)).toBeGreaterThan(rank(held));
  expect(rank(held)).toBeGreaterThan(rank(squandered));
});

it('penalizes own errors without treating opponent mistakes as own skill or resetting the starting position', () => {
  const g = game();
  const accurate = award(g);
  const ownError = analyzed(g);
  ownError.results[2].played.value = -400;
  const flawed = award(g, ownError);
  expect(flawed.amount).toBeLessThan(accurate.amount);
  expect(rank(flawed)).toBeLessThan(rank(accurate));
  expect(flawed.evidence.startingPosition).toBe('even');
  expect(flawed.evidence.worstChanceLoss).toBeGreaterThan(0);
  const opponentError = analyzed(g);
  opponentError.results[1].played.value = 400;
  expect(award(g, opponentError)).toEqual(accurate);
  // A subsequent error in an initially winning endgame cannot turn it into a
  // newly losing start that earns the comeback rubric.
  const winning = analyzed(g, 400);
  winning.results[2].played.value = -400;
  expect(award(g, winning).evidence.startingPosition).toBe('winning');
});

it('penalizes a serious blunder even among many accurate moves', () => {
  const g = parseGame(game().pgn.replace('3. Kd3 Kf5', `3. Kd3 Kf5 ${Array.from({ length: 30 }, (_, i) => `${i * 2 + 4}. Kc2 Kg6 ${i * 2 + 5}. Kd3 Kf5`).join(' ')}`));
  const cp = analyzed(g);
  cp.results[2].played.value = -10_000;
  expect(award(g, cp).evidence.quality).toBeLessThan(1 - ENDGAME_POLICY.worst_loss_weight / 2 + 0.01);
});

it('normalizes evaluations and outcomes for Black and respects the inclusive even boundary', () => {
  const g = game('0-1');
  const black = award(g, analyzed(g, 400), 'black');
  expect(black.evidence).toMatchObject({ startingPosition: 'losing', result: 'win', startingEvaluation: { type: 'cp', value: -400 } });
  expect(black.grade).toBe('S+');
  for (const value of [-ENDGAME_POLICY.even_cp, ENDGAME_POLICY.even_cp]) {
    expect(award(g, analyzed(g, value), 'black').evidence.startingPosition).toBe('even');
  }
});

it('scores only play after entry and includes promotion and the actual finish', () => {
  const transition = parseGame('[SetUp "1"]\n[FEN "8/7p/8/4k3/3B4/8/P7/K7 b - - 0 1"]\n\n1... Kxd4 2. Kb1 Ke5 3. Kc2 Kf4 1-0');
  const cp = analyzed(transition);
  cp.results[0].best.value = -900;
  cp.results[0].played.value = 900;
  expect(award(transition, cp).evidence).toMatchObject({ startPly: 1, startingPosition: 'even', ownMoves: 2, quality: 1 });
  const promoted = parseGame(pawnPgn);
  expect(promoted.frames.at(-1)!.checkmate).toBe(true);
  const promotionCp = analyzed(promoted);
  const clean = award(promoted, promotionCp);
  expect(clean.evidence).toMatchObject({ startPly: 0, ownMoves: 3, result: 'win' });
  promotionCp.results[2].played.value = -400;
  expect(award(promoted, promotionCp).amount).toBeLessThan(clean.amount);
  const returned = parseGame('[SetUp "1"]\n[FEN "8/Pk6/8/8/8/8/1P5p/K7 w - - 0 1"]\n\n1. a8=N Kxa8 2. Kb1 h1=Q 3. Kc2 1-0');
  expect(endgameContributions(returned, 'white', analyzed(returned))).toHaveLength(1);
});

it('handles mate evidence categorically, ignores simulated continuations, and follows actual checkmate over a result tag', () => {
  const g = game();
  const cp = analyzed(g);
  cp.results[0].best = { type: 'mate', value: -3 };
  cp.results[0].played = { type: 'mate', value: -3 };
  expect(award(g, cp).evidence.startingPosition).toBe('losing');
  const event = award(g, cp);
  cp.virtual = [{ san: 'Qg7#', uci: 'f7g7', fen: '' }];
  cp.virtualStatus = 'mate'; cp.virtualWinner = 'black';
  expect(award(g, cp)).toEqual(event);
  const mate = parseGame(pawnPgn.replaceAll('1-0', '0-1'));
  expect(award(mate).evidence.result).toBe('win');
});

it('keeps unfinished or unanalyzed games pending and awards no unplayed pawn endings', () => {
  const g = game();
  for (const checkpoint of [undefined, { ...analyzed(g), version: 'old' }, { ...analyzed(g), pgn: 'other' },
    { ...analyzed(g), results: analyzed(g).results.slice(0, -1) },
    { ...analyzed(g), results: analyzed(g).results.map((r, i) => i ? r : { ...r, played: { type: 'cp', value: NaN } }) } as Checkpoint]) {
    expect(pawnEndgameAssessment(g, 'white', checkpoint).status).toBe('analysis');
    expect(endgameContributions(g, 'white', checkpoint)).toEqual([]);
  }
  expect(pawnEndgameAssessment(game('*'), 'white', analyzed(game('*'))).status).toBe('unfinished');
  const noPlay = parseGame('[SetUp "1"]\n[FEN "8/7p/8/4k3/3B4/8/P7/K7 b - - 0 1"]\n\n1... Kxd4 0-1');
  for (const color of ['white', 'black'] as const) expect(pawnEndgameAssessment(noPlay, color, analyzed(noPlay)).status).toBe('no-play');
});

it('collects one stable game award, counts one high grade, and replaces it on color correction', () => {
  const g = game();
  const cp = analyzed(g);
  const first = prepareGrant([], g, 'white', cp);
  const event = first.events.find(e => e.kind === 'mastery' && e.family === 'endgame')!;
  const retried = prepareGrant([first], g, 'white', analyzed(g, 400));
  expect(retried.events.filter(e => e.kind === 'mastery' && e.family === 'endgame')).toEqual([event]);
  expect(prepareGrant([first], g, 'white').events).toEqual(first.events);
  expect(retainMastery(first, 'white', []).filter(e => e.kind === 'mastery')).toEqual([event]);
  const totals = projectCollection([retried]);
  expect(totals.masteries.mastery_pawn_vs_pawn).toMatchObject({ xp: event.amount, highGrades: 1 });
  expect(totals.mastery.xp).toBe(0);
  expect(totals.masteries.mastery_skewers.xp).toBe(0);
  const corrected = prepareGrant([first], g, 'black', cp);
  expect(corrected.events.filter(e => e.kind === 'mastery')).toHaveLength(1);
  expect(projectCollection([corrected]).masteries.mastery_pawn_vs_pawn.highGrades).toBe(0);
  expect(projectCollection([corrected]).masteries.mastery_pawn_vs_pawn.xp).toBeLessThan(event.amount);
  expect(gradeForContribution(event as EndgameMasteryContribution)).toBe('S-');
  expect(masteryProgress(20_000, 1, PAWN_VS_PAWN_MASTERY).level).toBe(5);
  expect(masteryProgress(20_000, 2, PAWN_VS_PAWN_MASTERY).level).toBe(6);
});

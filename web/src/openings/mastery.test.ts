import { expect, it } from 'vitest';
import pgn from '../fixtures/games/jobava.pgn?raw';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { openingAssessment, openingContributions, advantageSignal, openingFade } from './mastery';
import { openingClocks, openingTimeMultiplier } from './time';
import { OPENING_MASTERIES, gradeForContribution, masteryProgress } from '../achievements/mastery-policy';
import { prepareGrant, projectCollection } from '../achievements/collection';

const game = parseGame(pgn);
const total = (events: ReturnType<typeof openingContributions>) => events.reduce((s, e) => s + e.amount, 0);

it('requires complete matching analysis and platform clock evidence', () => {
  expect(openingAssessment(game, 'white').status).toBe('analysis');
  const cp = analyzed(game);
  expect(openingAssessment(game, 'white', { ...cp, pgn: 'unrelated' }).status).toBe('analysis');
  expect(openingAssessment(game, 'white', { ...cp, results: cp.results.slice(0, -1) }).status).toBe('analysis');
  expect(openingAssessment({ ...game, moves: game.moves.map(m => ({ ...m, clock: undefined })) }, 'white', cp).status).toBe('clocks');
  expect(openingAssessment({ ...game, timeControl: '?' }, 'white', cp).status).toBe('clocks');
  expect(openingAssessment(game, 'white', cp).status).toBe('ready');
});
it('awards theory plus larger independent-play XP and one explicit grade per game', () => {
  const events = openingContributions(game, 'white', analyzed(game));
  expect(events.filter(e => e.evidence.inBook).length).toBeGreaterThan(0);
  const novel = events.filter(e => !e.evidence.inBook);
  expect(novel.length).toBeGreaterThan(4);
  expect(novel[0].evidence.performanceXp).toBeGreaterThan(events.filter(e => e.evidence.inBook).reduce((s, e) => s + e.evidence.theoryXp, 0));
  expect(novel[0].evidence.decay).toBe(1);
  expect(novel.at(-1)!.evidence.decay).toBeLessThan(0.5);
  expect(events.filter(e => e.grade)).toHaveLength(1);
  expect(events.at(-1)!.grade).toBe('S+');
  expect(events.filter(e => gradeForContribution(e))).toHaveLength(1);
  const theory = parseGame('[TimeControl "600+0"]\n\n1. d4 {[%clk 0:10:00]} d5 {[%clk 0:10:00]} 2. Nc3 {[%clk 0:09:55]} Nf6 {[%clk 0:09:55]} 3. Bf4 {[%clk 0:09:50]} 1-0');
  const short = openingContributions(theory, 'white', analyzed(theory));
  expect(total(short)).toBeGreaterThan(0);
  expect(short.some(e => e.grade)).toBe(false);
});
it('rejects poor book moves and includes uncredited errors in the game grade', () => {
  const cp = analyzed(game);
  cp.results[4].played.value = -300;
  const events = openingContributions(game, 'white', cp);
  expect(events.some(e => e.ply === 5)).toBe(false);
  expect(events.at(-1)!.grade).not.toMatch(/^S/);
  expect(events.filter(e => e.grade)).toHaveLength(1);
});
it('rewards early precise conversion, fades continuously and never resets after a swing', () => {
  const cp = analyzed(game);
  for (const result of cp.results.slice(10)) result.best.value = result.played.value = 300;
  const events = openingContributions(game, 'white', cp);
  const novel = events.filter(e => !e.evidence.inBook);
  expect(novel[0].evidence.bonusXp).toBeGreaterThan(0);
  expect(novel[0].evidence.fade).toBe(1);
  expect(novel.at(-1)!.evidence.fade).toBeCloseTo(0.01);
  cp.results.slice(18).forEach(r => { r.best.value = r.played.value = -300; });
  const swung = openingContributions(game, 'white', cp);
  expect(swung.map(e => e.evidence.fade)).toEqual(events.map(e => e.evidence.fade));
  expect(swung.at(-1)!.evidence.bonusXp).toBe(0);
  cp.results.slice(18).forEach(r => { r.best.value = r.played.value = 0; });
  expect(openingContributions(game, 'white', cp).map(e => e.evidence.fade)).toEqual(events.map(e => e.evidence.fade));
  expect(advantageSignal(299)).toBeLessThan(advantageSignal(300));
  expect(advantageSignal(299)).toBeGreaterThan(0.99);
  expect(openingFade(100)).toBe(0.01);
});
it('withholds conversion bonus for imprecise play and handles mates without CP conversion', () => {
  const cp = analyzed(game);
  cp.results.slice(10).forEach(r => { r.best.value = 300; r.played.value = game.moves[r.ply - 1].color === 'white' ? 250 : 300; });
  const events = openingContributions(game, 'white', cp);
  expect(events.filter(e => !e.evidence.inBook).every(e => e.evidence.bonusXp === 0)).toBe(true);
  cp.results[10].best = { type: 'mate', value: 3 };
  cp.results[10].played = { type: 'cp', value: 900 };
  expect(openingContributions(game, 'white', cp).at(-1)!.grade).toBe('D-');
});
it('uses actual own clock deltas with increments, independent of opponent waiting', () => {
  const increment = { ...game, timeControl: '300+5', moves: game.moves.map((m, i) => ({ ...m, clock: 300 - Math.floor(i / 2) * 10 })) };
  const clocks = openingClocks(increment, 'white')!;
  expect(clocks.nominal).toBe(500);
  expect(clocks.seconds.get(1)).toBe(0);
  expect(clocks.seconds.get(3)).toBe(15);
  const waiting = { ...game, moves: game.moves.map(m => m.color === 'white' ? m : { ...m, clock: 600 }) };
  expect(openingClocks(waiting, 'white')!.seconds).toEqual(openingClocks(game, 'white')!.seconds);
  const broken = { ...game, moves: game.moves.map((m, i) => i === 4 ? { ...m, clock: 999 } : m) };
  expect(openingClocks(broken, 'white')).toBeUndefined();
  expect(openingTimeMultiplier(600, 300) / openingTimeMultiplier(300, 150)).toBeCloseTo(2.3, 1);
  expect(openingTimeMultiplier(600, 600)).toBe(openingTimeMultiplier(600, 999999));
  expect(openingTimeMultiplier(3600, 1800)).toBe(openingTimeMultiplier(7200, 3600));
});
it('applies outcome multipliers to XP without changing grades or double rounding each move', () => {
  const cp = analyzed(game);
  const win = openingContributions(game, 'white', cp);
  const draw = openingContributions({ ...game, result: '1/2-1/2' }, 'white', cp);
  const loss = openingContributions({ ...game, result: '0-1' }, 'white', cp);
  expect(Math.abs(total(win) - 2 * total(draw))).toBeLessThanOrEqual(1);
  expect(Math.abs(total(win) - 4 * total(loss))).toBeLessThanOrEqual(2);
  expect(win.at(-1)!.grade).toBe(draw.at(-1)!.grade);
  expect(win.at(-1)!.grade).toBe(loss.at(-1)!.grade);
});
it('persists independent sides, exactly one high-grade mark, and stable idempotent awards', () => {
  const saved = prepareGrant([], game, 'white', analyzed(game));
  const white = projectCollection([saved]).masteries.mastery_rapport_jobava_white;
  expect(white.xp).toBeGreaterThan(0);
  expect(white.highGrades).toBe(1);
  expect(projectCollection([saved]).masteries.mastery_rapport_jobava_black.xp).toBe(0);
  expect(prepareGrant([saved], game, 'white').events).toEqual(saved.events);
  expect(prepareGrant([saved], game, 'white', analyzed(game, 400)).events.filter(e => e.kind === 'mastery')).toEqual(saved.events.filter(e => e.kind === 'mastery')); 
  const black = prepareGrant([saved], game, 'black', analyzed(game));
  expect(projectCollection([black]).masteries.mastery_rapport_jobava_white.xp).toBe(0);
  expect(projectCollection([black]).masteries.mastery_rapport_jobava_black.xp).toBeGreaterThan(0);
  // Golden parity check also exercised through both profile import adapters.
  expect(projectCollection([black]).masteries.mastery_rapport_jobava_black.xp).toBe(408);
  const def = OPENING_MASTERIES[0];
  expect(masteryProgress(100000, 0, def).level).toBe(5);
  expect(masteryProgress(100000, 2, def).level).toBe(6);
  expect(masteryProgress(100000, 5, def).level).toBe(7);
  expect(masteryProgress(100000, 10, def).level).toBe(10);
});

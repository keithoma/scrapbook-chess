import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { quality, winningChances, pov, validAnalysis } from './quality';
import { contributions, prepareGrant, projectCollection } from './collection';
const cp = (value: number) => ({ type: 'cp' as const, value });
const mate = (value: number) => ({ type: 'mate' as const, value });
it('uses Lichess winning-chance loss, not flat CP loss, and ignores inaccuracies', () => {
  expect(winningChances(0)).toBe(0);
  expect(quality(cp(0), cp(-60))).toBe('clean');
  expect(quality(cp(0), cp(-110))).toBe('clean');
  expect(quality(cp(0), cp(-111))).toBe('mistake');
  expect(quality(cp(0), cp(-168))).toBe('mistake');
  expect(quality(cp(0), cp(-169))).toBe('blunder');
  expect(quality(cp(2000), cp(1500))).toBe('clean');
  expect(quality(cp(0), cp(100))).toBe('clean');
  expect(pov(cp(200), 'black')).toEqual(cp(-200));
});
it('uses the Lichess mate-created and mate-lost boundaries without classifying inaccuracies', () => {
  expect(quality(cp(-1000), mate(-1))).toBe('clean');
  expect(quality(cp(-999), mate(-1))).toBe('mistake');
  expect(quality(cp(-701), mate(-1))).toBe('mistake');
  expect(quality(cp(-700), mate(-1))).toBe('blunder');
  expect(quality(mate(2), cp(1000))).toBe('clean');
  expect(quality(mate(2), cp(999))).toBe('mistake');
  expect(quality(mate(2), cp(700))).toBe('blunder');
  expect(quality(mate(2), mate(-2))).toBe('blunder');
  expect(quality(mate(-5), mate(-1))).toBe('clean');
});
it('No Blunders requires a complete matching analysis of a win and inspects only the player moves', () => {
  for (const color of ['white', 'black'] as const) {
    const game = parseGame(`1. e4 e5 ${color === 'white' ? '1-0' : '0-1'}`);
    const cp = analyzed(game);
    const index = color === 'white' ? 0 : 1;
    const sign = color === 'white' ? -1 : 1;
    const events = () =>
      contributions(game, color, cp).filter(
        (event) => event.kind === 'badge' && event.badgeId === 'badge_no_blunders',
      );
    expect(events()).toHaveLength(1);
    cp.results[index].played.value = sign * 111;
    expect(events()).toHaveLength(1);
    cp.results[index].played.value = sign * 169;
    expect(events()).toEqual([]);
    cp.results[index].played.value = 0;
    cp.results[1 - index].played.value = -sign * 200;
    expect(events()).toHaveLength(1);
    cp.results.pop();
    expect(events()).toEqual([]);
    expect(validAnalysis(game, { ...analyzed(game), pgn: 'different' }, true)).toBe(false);
    expect(
      contributions(game, color).some(
        (event) => event.kind === 'badge' && event.badgeId === 'badge_no_blunders',
      ),
    ).toBe(false);
  }
});
it('keeps collected analysis badges through cache eviction and corrects the selected color', () => {
  const game = parseGame('1. e4 e5 1-0');
  const saved = prepareGrant([], game, 'white', analyzed(game));
  const again = prepareGrant([saved], game, 'white');
  expect(projectCollection([again]).totals.badge_no_blunders).toBe(1);
  expect(
    again.events.filter((event) => event.kind === 'badge' && event.badgeId === 'badge_no_blunders'),
  ).toEqual(
    saved.events.filter((event) => event.kind === 'badge' && event.badgeId === 'badge_no_blunders'),
  );
  expect(projectCollection([prepareGrant([saved], game, 'black')]).totals.badge_no_blunders).toBe(
    0,
  );
});

it('flawless wins ignore inaccuracies but reject player mistakes and blunders for either color', () => {
  for (const color of ['white', 'black'] as const) {
    const game = parseGame(`1. e4 e5 ${color === 'white' ? '1-0' : '0-1'}`);
    const checkpoint = analyzed(game);
    const index = color === 'white' ? 0 : 1;
    const sign = color === 'white' ? -1 : 1;
    const events = () =>
      contributions(game, color, checkpoint).filter(
        (event) => event.kind === 'badge' && event.badgeId === 'badge_no_mistakes_blunders',
      );
    checkpoint.results[index].played.value = sign * 110;
    expect(events()).toHaveLength(1);
    checkpoint.results[index].played.value = sign * 111;
    expect(events()).toEqual([]);
    checkpoint.results[index].played.value = sign * 169;
    expect(events()).toEqual([]);
    checkpoint.results[index].played.value = 0;
    checkpoint.results[1 - index].played.value = -sign * 200;
    expect(events()).toHaveLength(1);
    checkpoint.results.pop();
    expect(events()).toEqual([]);
  }
  const loss = parseGame('1. e4 e5 0-1');
  expect(
    contributions(loss, 'white', analyzed(loss)).some(
      (e) => e.kind === 'badge' && e.badgeId === 'badge_no_mistakes_blunders',
    ),
  ).toBe(false);
});

it('perfect evaluation applies the authored asymmetric White/Black boundaries to every actual position', () => {
  for (const [color, pass, fail] of [
    ['white', 1, 0],
    ['black', 49, 50],
  ] as const) {
    const game = parseGame(`1. e4 e5 ${color === 'white' ? '1-0' : '0-1'}`);
    const checkpoint = analyzed(game, pass);
    const events = () =>
      contributions(game, color, checkpoint).filter(
        (e) => e.kind === 'badge' && e.badgeId === 'badge_perfect_eval',
      );
    expect(events()).toHaveLength(1);
    checkpoint.results[1].played.value = fail;
    expect(events()).toEqual([]);
    checkpoint.results[1].played = { type: 'mate', value: color === 'white' ? -1 : 1 };
    expect(events()).toEqual([]);
    checkpoint.results[1].played.value *= -1;
    expect(events()).toHaveLength(1);
    checkpoint.results.pop();
    expect(events()).toEqual([]);
  }
});

it('keeps engine and factual event order stable from first collection through retries and eviction', () => {
  const game = parseGame('[UTCDate "2026.11.08"]\n[UTCTime "11:00:00"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  const checkpoint = analyzed(game);
  const first = prepareGrant([], game, 'black', checkpoint);
  expect(
    first.events.some((event) => event.kind === 'badge' && event.badgeId === 'badge_no_blunders'),
  ).toBe(true);
  expect(
    first.events.some((event) => event.kind === 'badge' && event.badgeId === 'badge_played_sunday'),
  ).toBe(true);
  for (const analysis of [checkpoint, undefined]) {
    const again = prepareGrant([first], game, 'black', analysis);
    expect(again.events).toEqual(first.events);
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(first.events));
  }
});

import { expect, it } from 'vitest';
import { pgnClock, lichessClocks } from '../../../shared/clocks';
import { parseGame } from '../game';
import { contributions, prepareGrant } from './collection';

export function clockGame(clocks: (number | undefined)[], result = '1-0') {
  const game = parseGame(`1. e4 e5 2. Nf3 Nc6 ${result}`);
  game.moves = game.moves.map((move, i) => ({ ...move, clock: clocks[i] }));
  return game;
}
it('parses PGN clocks and API centiseconds without guessing missing or malformed evidence', () => {
  expect(pgnClock(['[%clk 0:09:58.25]'])).toBe(598.25);
  expect(pgnClock(['[%clk 1:00:00]'])).toBe(3600);
  expect(pgnClock(['[%clk 0:60:00]'])).toBeUndefined();
  expect(pgnClock(['unrelated comment'])).toBeUndefined();
  expect(lichessClocks([59825, 59000], 2)).toEqual([598.25, 590]);
  expect(lichessClocks([5], 2)).toEqual([null, null]);
  const annotated = parseGame('1. e4 {[%clk 0:09:58]} e5 {[%clk 0:09:50]} 1-0');
  expect(annotated.moves.map(move => move.clock)).toEqual([598, 590]);
});
it('requires a strict clock lead at every observable paired sample, for either winning color', () => {
  const id = 'badge_time_advantage';
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const clocks = color === 'white' ? [598, 590, 595, 580] : [590, 598, 580, 595];
    const game = clockGame(clocks, result);
    expect(contributions(game, color).filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 4 }]);
    const saved = prepareGrant([], game, color); expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
  for (const game of [clockGame([598, 598, 595, 580]), clockGame([598, 590, 585, 580]), clockGame([undefined, 590, 595, 580]), clockGame([598, 590, 595, 580], '1/2-1/2')])
    expect(contributions(game, 'white').some(event => event.kind === 'badge' && event.badgeId === id)).toBe(false);
});
it('Clutch requires both clocks at or below thirty seconds in a recorded sample and an actual win', () => {
  for (const color of ['white', 'black'] as const) {
    const game = clockGame([29, 30, 27, 28], color === 'white' ? '1-0' : '0-1');
    expect(contributions(game, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_time_scramble')).toEqual([{ kind: 'badge', badgeId: 'badge_time_scramble', amount: 1, ply: 4 }]);
    expect(contributions(game, color === 'white' ? 'black' : 'white').some(event => event.kind === 'badge' && event.badgeId === 'badge_time_scramble')).toBe(false);
  }
  for (const game of [clockGame([31, 30, 31, 30]), clockGame([29, 30, 27, 28], '1/2-1/2'), clockGame([undefined, 30, 27, 28])])
    expect(contributions(game, 'white').some(event => event.kind === 'badge' && event.badgeId === 'badge_time_scramble')).toBe(false);
});

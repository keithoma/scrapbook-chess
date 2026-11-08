import { expect, it } from 'vitest';
import { timeZone, utcGameStart } from '../../../shared/time-zone';
import { parseGame } from '../game';
import { contributions, prepareGrant, projectCollection } from './collection';

export function calendarGame(iso: string, zone: string, result = '1-0') {
  return { ...parseGame(`1. e4 e5 ${result}`), startedAt: Date.parse(iso), timeZone: zone };
}
it('classifies Monday from the game start in the selected IANA timezone, including midnight and DST', () => {
  const id = 'badge_played_monday';
  for (const [iso, zone, expected] of [
    ['2026-11-08T23:30:00Z', 'Europe/Berlin', 1], ['2026-11-08T23:30:00Z', 'UTC', 0],
    ['2026-11-09T04:30:00Z', 'America/New_York', 0], ['2026-11-09T05:30:00Z', 'America/New_York', 1],
    ['2026-03-29T22:30:00Z', 'Europe/Berlin', 1], ['2026-10-25T23:30:00Z', 'Europe/Berlin', 1],
  ] as const) {
    const game = calendarGame(iso, zone, '1/2-1/2');
    expect(contributions(game, 'white').filter(event => event.kind === 'badge' && event.badgeId === id).length).toBe(expected);
    expect(contributions(game, 'black').filter(event => event.kind === 'badge' && event.badgeId === id).length).toBe(expected);
  }
});
it('preserves the collected timezone through settings changes and recollection', () => {
  const game = calendarGame('2026-11-08T23:30:00Z', 'Europe/Berlin');
  const old = prepareGrant([], game, 'white');
  const saved = prepareGrant([old], { ...game, timeZone: 'UTC' }, 'white');
  expect(saved.timeZone).toBe('Europe/Berlin');
  expect(saved.events).toEqual(old.events);
  expect(projectCollection([saved]).totals.badge_played_monday).toBe(1);
});
it('does not guess missing timestamps, local PGN dates, invalid dates, or invalid zones', () => {
  expect(timeZone('Mars/Olympus')).toBeUndefined();
  expect(timeZone('Europe/Berlin')).toBe('Europe/Berlin');
  expect(utcGameStart(new Map([['UTCDate', '2026.02.30'], ['UTCTime', '12:00:00']]))).toBeUndefined();
  expect(utcGameStart(new Map([['Date', '2026.11.09'], ['UTCTime', '12:00:00']]))).toBeUndefined();
  expect(parseGame('[UTCDate "2026.11.09"]\n[UTCTime "12:00:00"]\n\n1. e4 e5 1-0').startedAt).toBe(Date.parse('2026-11-09T12:00:00Z'));
  expect(contributions({ ...calendarGame('2026-11-09T12:00:00Z', 'UTC'), startedAt: undefined }, 'white').some(event => event.kind === 'badge' && event.badgeId === 'badge_played_monday')).toBe(false);
});

it('badge_played_tuesday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-10T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_tuesday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_tuesday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-11T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-10T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_wednesday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-11T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_wednesday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_wednesday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-12T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-11T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_thursday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-12T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_thursday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_thursday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-13T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-12T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_friday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-13T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_friday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_friday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-14T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-13T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_saturday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-14T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_saturday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_saturday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-15T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-14T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_sunday uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-15T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_sunday');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_sunday', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-16T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-15T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_time_00_04 uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-09T00:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_time_00_04');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_time_00_04', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-09T04:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-09T00:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_time_04_08 uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-09T04:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_time_04_08');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_time_04_08', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-09T08:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-09T04:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_time_08_12 uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-09T08:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_time_08_12');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_time_08_12', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-09T12:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-09T08:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_time_12_16 uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-09T12:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_time_12_16');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_time_12_16', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-09T16:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-09T12:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

it('badge_played_time_16_20 uses the saved timezone and original start, with correct outcome filtering', () => {
  for (const color of ['white', 'black'] as const) {
    const win = color === 'white' ? '1-0' : '0-1';
    const game = calendarGame('2026-11-09T16:00:00Z', 'UTC', win);
    const selected = (g: typeof game) => contributions(g, color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_played_time_16_20');
    expect(selected(game)).toEqual([{ kind: 'badge', badgeId: 'badge_played_time_16_20', amount: 1, ply: 2 }]);
    expect(selected(calendarGame('2026-11-09T20:00:00Z', 'UTC', win))).toEqual([]);
    expect(selected(calendarGame('2026-11-09T16:00:00Z', 'UTC', '1/2-1/2')).length).toBe(1);
    const saved = prepareGrant([], game, color);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
  }
});

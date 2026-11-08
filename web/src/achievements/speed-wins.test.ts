import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { contributions, prepareGrant, projectCollection } from './collection';

it('credits ultrabullet wins from clock settings once, for either color, at game end', () => {
  const id = 'badge_won_ultrabullet';
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const pgn = '[Event "incorrect speed label"]\n[TimeControl "15+0"]\n\n1. e4 e5 ' + result;
    const game = parseGame(pgn);
    const grant = prepareGrant([], game, color);
    expect(grant.events.filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 2 }]);
    expect(prepareGrant([grant], game, color).events).toEqual(grant.events);
    expect(projectCollection([grant]).totals[id]).toBe(1);
    for (const other of [parseGame(pgn.replace(result, '1/2-1/2')), parseGame(pgn.replace('15+0', '3600+0'))])
      expect(contributions(other, color).filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
    expect(contributions(game, color === 'white' ? 'black' : 'white').filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
  }
});

it('credits hyperbullet wins from clock settings once, for either color, at game end', () => {
  const id = 'badge_won_hyperbullet';
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const pgn = '[Event "incorrect speed label"]\n[TimeControl "30+0"]\n\n1. e4 e5 ' + result;
    const game = parseGame(pgn);
    const grant = prepareGrant([], game, color);
    expect(grant.events.filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 2 }]);
    expect(prepareGrant([grant], game, color).events).toEqual(grant.events);
    expect(projectCollection([grant]).totals[id]).toBe(1);
    for (const other of [parseGame(pgn.replace(result, '1/2-1/2')), parseGame(pgn.replace('30+0', '3600+0'))])
      expect(contributions(other, color).filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
    expect(contributions(game, color === 'white' ? 'black' : 'white').filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
  }
});

it('credits bullet wins from clock settings once, for either color, at game end', () => {
  const id = 'badge_won_bullet';
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const pgn = '[Event "incorrect speed label"]\n[TimeControl "60+0"]\n\n1. e4 e5 ' + result;
    const game = parseGame(pgn);
    const grant = prepareGrant([], game, color);
    expect(grant.events.filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 2 }]);
    expect(prepareGrant([grant], game, color).events).toEqual(grant.events);
    expect(projectCollection([grant]).totals[id]).toBe(1);
    for (const other of [parseGame(pgn.replace(result, '1/2-1/2')), parseGame(pgn.replace('60+0', '3600+0'))])
      expect(contributions(other, color).filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
    expect(contributions(game, color === 'white' ? 'black' : 'white').filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
  }
});

it('credits blitz wins from clock settings once, for either color, at game end', () => {
  const id = 'badge_won_blitz';
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const pgn = '[Event "incorrect speed label"]\n[TimeControl "300+0"]\n\n1. e4 e5 ' + result;
    const game = parseGame(pgn);
    const grant = prepareGrant([], game, color);
    expect(grant.events.filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 2 }]);
    expect(prepareGrant([grant], game, color).events).toEqual(grant.events);
    expect(projectCollection([grant]).totals[id]).toBe(1);
    for (const other of [parseGame(pgn.replace(result, '1/2-1/2')), parseGame(pgn.replace('300+0', '3600+0'))])
      expect(contributions(other, color).filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
    expect(contributions(game, color === 'white' ? 'black' : 'white').filter(event => event.kind === 'badge' && event.badgeId === id)).toEqual([]);
  }
});

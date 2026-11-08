import { describe, expect, it } from 'vitest';
import { parseGame } from '../game';
import { lichessSpeed } from '../time-control';
import { BADGES } from './catalog';
import { contributions, prepareGrant, projectCollection, newlyUnlocked } from './collection';

const pgn = (control: string, site = '') => `[TimeControl "${control}"]\n[Site "${site}"]\n\n1. e4 e5 1/2-1/2`;
const speedIds = ['badge_played_ultrabullet', 'badge_played_bullet', 'badge_played_blitz', 'badge_played_rapid', 'badge_played_classical'];

describe('Lichess mileage classification for both platforms', () => {
  it('uses every official duration boundary, including increments', () => {
    for (const [control, speed] of [
      ['15+0', 'ultrabullet'], ['29', 'ultrabullet'], ['30+0', 'bullet'],
      ['60+0', 'bullet'], ['179+0', 'bullet'], ['180+0', 'blitz'],
      ['479+0', 'blitz'], ['480+0', 'rapid'], ['1499+0', 'rapid'], ['1500+0', 'classical'],
      ['60+2', 'bullet'], ['120+2', 'blitz'], ['300+5', 'rapid'], ['900+15', 'classical'], ['0+1', 'bullet'],
    ]) expect(lichessSpeed(control)).toBe(speed);
  });

  it('does not guess a speed for missing, malformed, correspondence, or multi-stage controls', () => {
    for (const control of ['', '-', '?', '0', '0+0', '-60+0', '600+-1', '60.5+0', '1/86400', '40/7200:3600', '*300', '9007199254740992+0']) {
      expect(lichessSpeed(control)).toBeUndefined();
      const events = contributions(parseGame(pgn(control)), 'white');
      expect(events.some(event => event.kind === 'badge' && speedIds.includes(event.badgeId))).toBe(false);
      expect(events).toContainEqual({ kind: 'badge', badgeId: 'badge_played_total', amount: 1, ply: 2 });
    }
  });

  it('awards total mileage and exactly one speed badge at game end, irrespective of color, result, or source', () => {
    for (const [control, id] of [['15', speedIds[0]], ['30', speedIds[1]], ['300', speedIds[2]], ['600', speedIds[3]], ['1800', speedIds[4]]]) {
      for (const site of ['https://lichess.org/Abcd1234', 'https://www.chess.com/game/live/1234']) {
        for (const color of ['white', 'black'] as const) {
          const events = contributions(parseGame(pgn(control, site)), color);
          expect(events.filter(event => event.kind === 'badge' && speedIds.includes(event.badgeId))).toEqual([
            { kind: 'badge', badgeId: id, amount: 1, ply: 2 },
          ]);
          expect(events).toContainEqual({ kind: 'badge', badgeId: 'badge_played_total', amount: 1, ply: 2 });
        }
      }
    }
    expect(BADGES.some(badge => badge.id === ('badge_played_hyperbullet' as string))).toBe(false);
  });

  it('preserves authored thresholds and hidden status, and recollects an old game once', () => {
    expect(BADGES.find(badge => badge.id === 'badge_played_ultrabullet')?.config.is_hidden).toBe(true);
    const rapid = BADGES.find(badge => badge.id === 'badge_played_rapid')!;
    expect(rapid.name).toBe('Restroom Rapid Ritual');
    expect(rapid.config.tiers.map(tier => tier.amount)).toEqual([1, 5, 19, 83, 131, 829, 1367, 2969, 5000]);
    const game = parseGame(pgn('600'));
    const old = prepareGrant([], game, 'white');
    old.events = old.events.filter(event => event.kind !== 'badge' || !speedIds.includes(event.badgeId));
    const updated = prepareGrant([old], game, 'white');
    expect(projectCollection([updated]).totals).toMatchObject({ badge_played_total: 1, badge_played_rapid: 1, badge_played_blitz: 0 });
    expect(newlyUnlocked([old], [updated]).tiers.map(item => item.badge.name)).toEqual(['Restroom Rapid Ritual']);
    expect(prepareGrant([updated], game, 'white').events).toEqual(updated.events);
    expect(() => contributions(parseGame(pgn('600').replace('1/2-1/2', '*')), 'white')).toThrow(/completed/);
  });
});

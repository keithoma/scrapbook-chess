import { describe, expect, it } from 'vitest';
import { gameRating, pgnRating } from '../../../shared/ratings';
import { parseGame } from '../game';
import { BADGES, RATING_GAPS } from './catalog';
import { contributions, newlyUnlocked, prepareGrant, projectCollection } from './collection';

function game(white = '1700', black = '1800', result = '1-0') {
  return parseGame(`[WhiteElo "${white}"]\n[BlackElo "${black}"]\n\n1. e4 e5 ${result}`);
}
function ratingEvents(g = game(), color: 'white' | 'black' = 'white') {
  return contributions(g, color).filter(event => event.kind === 'badge' && ['badge_upset', 'hold_your_own'].includes(event.badgeId));
}

describe('Against the Odds badges', () => {
  it('uses inclusive authored gaps and only the actual player-relative outcome', () => {
    expect(RATING_GAPS).toEqual({ win: 100, draw: 150 });
    for (const color of ['white', 'black'] as const) {
      for (const gap of [99, 100, 149, 150, 999]) {
        const white = String(color === 'white' ? 1700 : 1700 + gap);
        const black = String(color === 'black' ? 1700 : 1700 + gap);
        const win = color === 'white' ? '1-0' : '0-1';
        expect(ratingEvents(game(white, black, win), color)).toEqual(gap >= 100
          ? [{ kind: 'badge', badgeId: 'badge_upset', amount: 1, ply: 2 }] : []);
        expect(ratingEvents(game(white, black, '1/2-1/2'), color)).toEqual(gap >= 150
          ? [{ kind: 'badge', badgeId: 'hold_your_own', amount: 1, ply: 2 }] : []);
        expect(ratingEvents(game(white, black, win), color === 'white' ? 'black' : 'white')).toEqual([]);
        expect(ratingEvents(game(white, black, color === 'white' ? '0-1' : '1-0'), color)).toEqual([]);
      }
    }
    expect(ratingEvents(game('1700', '1700'))).toEqual([]);
    expect(ratingEvents(game('1900', '1700', '1/2-1/2'))).toEqual([]);
  });

  it('accepts only valid pre-game ratings and skips either explicitly provisional player', () => {
    for (const value of ['', '?', '0', '-1', '1700.5', '1e3', 'unknown', '9007199254740992', '1700?']) {
      expect(ratingEvents(game(value, '1900'))).toEqual([]);
      expect(ratingEvents(game('1700', value))).toEqual([]);
    }
    expect(pgnRating('1700?')).toEqual({ value: 1700, provisional: true });
    expect(gameRating(1700)).toEqual({ value: 1700, provisional: false });
    for (const value of [undefined, null, '1700', 0, -1, 1700.5, NaN, Infinity]) expect(gameRating(value)).toBeUndefined();
    expect(gameRating(1700, 'false')).toBeUndefined();
    const provisional = game('1700', '1900');
    provisional.ratings.black!.provisional = true;
    expect(ratingEvents(provisional)).toEqual([]);
  });

  it('uses a board-proven mate rather than a contradictory draw header', () => {
    const mate = parseGame('[WhiteElo "1900"]\n[BlackElo "1700"]\n\n1. f3 e5 2. g4 Qh4# 1/2-1/2');
    expect(ratingEvents(mate, 'black')).toEqual([{ kind: 'badge', badgeId: 'badge_upset', amount: 1, ply: 4 }]);
    expect(ratingEvents(mate, 'white')).toEqual([]);
  });

  it('recollects older records once, freezes the rating evidence, and corrects player color', () => {
    const g = game('1700', '1900');
    const old = prepareGrant([], g, 'white');
    old.events = old.events.filter(event => event.kind !== 'badge' || event.badgeId !== 'badge_upset');
    const saved = prepareGrant([old], g, 'white');
    expect(projectCollection([saved]).totals.badge_upset).toBe(1);
    expect(newlyUnlocked([old], [saved]).tiers.map(item => item.badge.id)).toEqual(['badge_upset']);
    expect(prepareGrant([saved], g, 'white').events).toEqual(saved.events);
    expect(projectCollection([prepareGrant([saved], g, 'black')]).totals.badge_upset).toBe(0);
    g.ratings.white!.value = 1800;
    expect(saved.ratings?.white?.value).toBe(1700);
  });

  it('has complete flavor, taxonomy, and unchanged tier amounts for both badges', () => {
    for (const id of ['badge_upset', 'hold_your_own']) {
      const badge = BADGES.find(item => item.id === id)!;
      expect(badge.category).toBe('Resilience');
      expect(badge.subcategory).toBe('Against the Odds');
      expect(badge.name.trim()).not.toBe('');
      expect(badge.flavor?.text).toBeTruthy();
      expect(badge.config.tiers.map(tier => tier.amount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const tier of badge.config.tiers) expect(tier.flavor?.text ?? tier.flavor?.player_quote).toBeTruthy();
    }
  });
});

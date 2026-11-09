import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CollectionView } from './collection-ui';
import type { GameGrant } from './collection';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import pgn from '../fixtures/games/caro-kann.pgn?raw';
import { openingContributions } from '../openings/mastery';

const render = (games: GameGrant[]) => renderToStaticMarkup(createElement(CollectionView, {
  games, locale: 'en', failed: false, busy: false, onOpen: () => {},
}));
const game = parseGame(pgn);
const event = openingContributions(game, 'white', analyzed(game))
  .find(event => event.masteryId === 'mastery_caro_kann_advance_variation_short_variation_white')!;
const grant = (amount: number): GameGrant => ({
  id: 'visibility-test', version: 1, pgn, color: 'white',
  events: [{ ...event, amount, grade: 'S+' }],
  collectedAt: '2026-11-09', updatedAt: '2026-11-09',
});

it('keeps unearned opening tracks out of the collection and page count, even with a saved grade', () => {
  for (const games of [[], [grant(0)]]) {
    const html = render(games);
    expect(html).not.toContain('data-testid="mastery_caro_kann');
    expect(html).not.toContain('data-testid="mastery_rapport_jobava');
    expect(html).not.toContain('data-testid="mastery_queens_pawn_game');
    expect(html).not.toContain('aria-label="Mastery pages"');
    for (const id of ['fork-mastery', 'skewer-mastery', 'mastery_pawn_vs_pawn'])
      expect(html).toContain(`data-testid="${id}"`);
  }
});

it('reveals a track at exactly one collected XP without revealing its other color, parent, or siblings', () => {
  const html = render([grant(1)]);
  expect(html).toContain('data-testid="mastery_caro_kann_advance_variation_short_variation_white"');
  for (const id of [
    'mastery_caro_kann_advance_variation_short_variation_black',
    'mastery_caro_kann_white', 'mastery_caro_kann_advance_variation_white',
    'mastery_caro_kann_advance_variation_tal_variation_white',
  ]) expect(html).not.toContain(`data-testid="${id}"`);
  expect(html).not.toContain('aria-label="Mastery pages"');
});

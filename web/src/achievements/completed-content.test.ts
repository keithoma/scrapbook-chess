import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { BADGES, BADGE_IDS, type Flavor } from './catalog';

const sources = import.meta.glob('../../../data/achievements/badges/**/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
it('activates every source badge exactly once', () => {
  const ids = Object.values(sources).flatMap((source) =>
    parse(source as string).map((badge: { id: string }) => badge.id),
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect([...BADGE_IDS].sort()).toEqual(ids.sort());
});
const flavor = (entry: { flavor?: Flavor; flavor_text?: string }) =>
  entry.flavor?.text || entry.flavor?.quote || entry.flavor?.player_quote || entry.flavor_text;
it.each(BADGES)('$id has a complete name, taxonomy, base flavor and every tier flavor', (badge) => {
  expect(badge.name.trim()).not.toBe('');
  expect(badge.category.trim()).not.toBe('');
  expect(badge.subcategory.trim()).not.toBe('');
  expect(flavor(badge)?.trim()).toBeTruthy();
  for (const tier of badge.config.tiers) expect(flavor(tier)?.trim()).toBeTruthy();
});

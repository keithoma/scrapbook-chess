import { readFile, readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BADGES } from './catalog';
import { MASTERIES } from './mastery-policy';
import { achievementReference } from '../../scripts/achievement-reference';
import legacyMasteries from '../../../data/achievements/mastery.json';

const root = new URL('../../../docs/reference/', import.meta.url);
const generated = achievementReference();
it('keeps the published implemented-achievement list synchronized with the runtime catalogs', async () => {
  for (const [name, content] of Object.entries(generated)) {
    expect(await readFile(new URL(name, root), 'utf8'), `${name} is stale; run pnpm achievements:generate`).toBe(content);
  }
  const existing = (await readdir(new URL('implemented-achievements/', root))).sort();
  expect(existing).toEqual(Object.keys(generated).filter(name => name.startsWith('implemented-achievements/')).map(name => name.split('/').at(-1)).sort());
});
it('lists every active definition exactly once, with its exact name and ID, and excludes inactive drafts', () => {
  const tables = Object.entries(generated).filter(([name]) => name !== 'implemented-achievements.md').map(([, content]) => content).join('\n');
  const ids = [...tables.matchAll(/\| `([^`]+)` \|/g)].map(match => match[1]);
  const active = [...BADGES, ...MASTERIES];
  expect(ids.sort()).toEqual(active.map(entry => entry.id).sort());
  expect(new Set(ids).size).toBe(ids.length);
  for (const entry of active) expect(tables).toContain(`| ${entry.name} | \`${entry.id}\` |`);
  const badges = generated['implemented-achievements/badges.md'];
  expect(badges).toContain('| When you get it |');
  for (const badge of BADGES) {
    expect(badge.description.trim()).not.toBe('');
    expect(badges).toContain(`| ${badge.name} | \`${badge.id}\` | ${badge.description.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')} |`);
  }
  for (const draft of legacyMasteries) expect(ids).not.toContain(draft.id);
});

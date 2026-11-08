import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { tacticalReviewFixtures } from '../../dev/tactical-review-fixtures';
import { TACTICAL_REVIEW_URL, tacticalReviewFilename, type TacticalReviewFixture } from './review-fixture';
import { parseGame } from '../game';
import forkPgn from '../fixtures/games/knight-fork.pgn?raw';

let directory: string;
let server: ViteDevServer;
let origin: string;
const game = parseGame(forkPgn);
const review: TacticalReviewFixture = {
  schemaVersion: 1, pgn: game.pgn, masteryId: 'mastery_knight_forks', ply: 1, expectedXp: 'positive',
  analysis: {
    version: 'captured-engine-version',
    result: { ply: 1, bestMove: game.moves[0].uci, best: { type: 'cp', value: 10 }, played: { type: 'cp', value: 5 } },
  },
  observed: { status: 'qualified', xp: 100 },
};

async function start() {
  server = await createServer({
    configFile: false, root: directory, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [tacticalReviewFixtures({ directory })],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP dev server.');
  origin = `http://127.0.0.1:${address.port}`;
}
function save(value: unknown, headers: Record<string, string> = {}) {
  return fetch(`${origin}${TACTICAL_REVIEW_URL}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
  });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scrapbook-tactical-review-'));
  await start();
});
afterEach(async () => {
  await server?.close();
  await rm(directory, { recursive: true, force: true });
});

it('persists a complete review to disk, restores it after a restart, and replaces a changed judgment', async () => {
  const filename = await tacticalReviewFilename(review);
  expect((await fetch(`${origin}${TACTICAL_REVIEW_URL}/${filename}`)).status).toBe(404);
  const response = await save(review);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ filename });
  expect(JSON.parse(await readFile(join(directory, filename), 'utf8'))).toEqual(review);
  await server.close();
  await start();
  const restored = await fetch(`${origin}${TACTICAL_REVIEW_URL}/${filename}`);
  expect(restored.headers.get('Cache-Control')).toBe('no-store');
  expect(await restored.json()).toEqual(review);
  expect((await save({ ...review, expectedXp: 'zero' })).status).toBe(200);
  expect(JSON.parse(await readFile(join(directory, filename), 'utf8')).expectedXp).toBe('zero');
  expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toEqual([filename]);
  expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false);
});

it('keeps different mastery judgments separate on the same game and ply', async () => {
  expect((await save(review)).ok).toBe(true);
  const other = { ...review, masteryId: 'mastery_skewers', expectedXp: 'zero' };
  expect((await save(other)).ok).toBe(true);
  expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toHaveLength(2);
});

it('rejects invalid labels, engine evidence, PGNs, moves, and filenames before writing files', async () => {
  for (const invalid of [
    { ...review, expectedXp: 'yes' },
    { ...review, masteryId: '../../outside' },
    { ...review, pgn: 'not a game' },
    { ...review, ply: 2, analysis: { ...review.analysis, result: { ...review.analysis.result, ply: 2 } } },
    { ...review, analysis: { ...review.analysis, result: { ...review.analysis.result, ply: 2 } } },
    { ...review, analysis: { ...review.analysis, result: { ...review.analysis.result, best: { type: 'other', value: 0 } } } },
    { ...review, analysis: null },
    null,
  ]) expect((await save(invalid)).status).toBe(400);
  expect((await fetch(`${origin}${TACTICAL_REVIEW_URL}/bad.json`)).status).toBe(400);
  expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toEqual([]);
});

it('rejects cross-origin writes, non-JSON requests, malformed JSON, and unsupported methods', async () => {
  expect((await save(review, { Origin: 'https://example.com' })).status).toBe(403);
  expect((await save(review, { 'Content-Type': 'text/plain' })).status).toBe(415);
  expect((await fetch(`${origin}${TACTICAL_REVIEW_URL}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{',
  })).status).toBe(400);
  expect((await fetch(`${origin}${TACTICAL_REVIEW_URL}`, { method: 'DELETE' })).status).toBe(405);
});

it('installs the filesystem endpoint only on the development server', () => {
  const plugin = tacticalReviewFixtures();
  expect(plugin.apply).toBe('serve');
  expect(plugin.configureServer).toBeTypeOf('function');
  expect(plugin.configurePreviewServer).toBeUndefined();
  expect(plugin.generateBundle).toBeUndefined();
});

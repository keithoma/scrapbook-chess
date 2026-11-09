import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanGainReviews } from '../../dev/clean-gain-reviews';
import { CLEAN_REVIEW_URL, type CleanGainReview } from './clean-gain-review';
import { cleanGainFixture } from '../fixtures/clean-gain-evidence';

let directory: string;
let server: ViteDevServer;
let origin: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'clean-review-test-'));
  server = await createServer({ configFile: false, root: directory, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: [cleanGainReviews({ directory })] });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error();
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { await server?.close(); await rm(directory, { recursive: true, force: true }); });
function fixture(): CleanGainReview {
  const { game, evidence } = cleanGainFixture();
  return { schemaVersion: 1, pgn: game.pgn, capturePly: 2, expected: 'clean', note: '', analysisVersion: 'test', evidence, book: [] };
}
const save = (value: unknown, headers = {}) => fetch(`${origin}${CLEAN_REVIEW_URL}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
});
it('persists and replaces independent judgments with exact engine evidence', async () => {
  const review = fixture();
  const response = await save(review);
  expect(response.status).toBe(200);
  const { filename } = await response.json();
  expect(JSON.parse(await readFile(join(directory, filename), 'utf8'))).toEqual(review);
  const loaded = await fetch(`${origin}${CLEAN_REVIEW_URL}/${filename}`);
  expect(await loaded.json()).toEqual(review);
  expect(loaded.headers.get('Cache-Control')).toBe('no-store');
  expect((await save({ ...review, expected: 'not-clean', note: 'Material comes back.' })).status).toBe(200);
  expect((await readdir(directory)).filter(file => file.endsWith('.json'))).toEqual([filename]);
  expect(JSON.parse(await readFile(join(directory, filename), 'utf8')).expected).toBe('not-clean');
});
it('rejects malformed evidence and foreign-origin writes without leaving fixtures', async () => {
  expect((await save(fixture(), { Origin: 'https://untrusted.example' })).status).toBe(403);
  expect((await save({ ...fixture(), evidence: {} })).status).toBe(400);
  expect((await save(null)).status).toBe(400);
  expect((await fetch(`${origin}${CLEAN_REVIEW_URL}/bad.json`)).status).toBe(400);
  expect((await readdir(directory)).filter(file => file.endsWith('.json'))).toEqual([]);
});

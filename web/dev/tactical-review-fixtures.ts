import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { parseGame } from '../src/game';
import {
  TACTICAL_REVIEW_URL, tacticalReviewFilename, type TacticalReviewFixture,
} from '../src/tactics/review-fixture';

const filenamePattern = /^mastery_[a-z0-9_]+-[1-9]\d*-[a-f0-9]{64}\.json$/;
class InvalidReview extends Error {}

function parseFixture(value: unknown): TacticalReviewFixture {
  const fixture = value as TacticalReviewFixture | null;
  const score = (value: unknown) => {
    const s = value as { type?: string; value?: number } | null;
    return s && (s.type === 'cp' || s.type === 'mate') && Number.isSafeInteger(s.value);
  };
  if (!fixture || fixture.schemaVersion !== 1 ||
      typeof fixture.masteryId !== 'string' || !/^mastery_[a-z0-9_]+$/.test(fixture.masteryId) ||
      typeof fixture.pgn !== 'string' || !Number.isSafeInteger(fixture.ply) || fixture.ply < 1 ||
      !['positive', 'zero'].includes(fixture.expectedXp) ||
      typeof fixture.analysis?.version !== 'string' || !fixture.analysis.version ||
      fixture.analysis.result?.ply !== fixture.ply ||
      !score(fixture.analysis.result.best) || !score(fixture.analysis.result.played) ||
      typeof fixture.analysis.result.bestMove !== 'string' ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(fixture.analysis.result.bestMove) ||
      !['qualified', 'pending', 'rejected'].includes(fixture.observed?.status) ||
      !Number.isSafeInteger(fixture.observed.xp) || fixture.observed.xp < 0)
    throw new InvalidReview('Invalid tactical review.');
  try {
    const game = parseGame(fixture.pgn);
    if (!game.moves.some(move => move.ply === fixture.ply)) throw new Error();
  } catch {
    throw new InvalidReview('The review must identify a played move in one valid PGN.');
  }
  // Persist only the fixture schema, without incidental request fields.
  const { masteryId, ply, expectedXp, analysis, observed } = fixture;
  return {
    schemaVersion: 1, masteryId, pgn: fixture.pgn.trim(), ply, expectedXp,
    analysis: {
      version: analysis.version,
      result: {
        ply, best: { type: analysis.result.best.type, value: analysis.result.best.value },
        played: { type: analysis.result.played.type, value: analysis.result.played.value },
        bestMove: analysis.result.bestMove,
      },
    },
    observed: { status: observed.status, xp: observed.xp },
  };
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_000_000) throw new InvalidReview('Tactical review is too large.');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InvalidReview('Invalid JSON.'); }
}

export function tacticalReviewFixtures(options: { directory?: string } = {}): Plugin {
  return {
    name: 'tactical-review-fixtures',
    apply: 'serve',
    // configureServer never runs for a production build or vite preview.
    configureServer(server) {
      const directory = options.directory ?? join(server.config.root, 'src/fixtures/tactical-reviews');
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== TACTICAL_REVIEW_URL && !url.pathname.startsWith(`${TACTICAL_REVIEW_URL}/`))
          return next();
        const respond = (status: number, value: unknown) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(value));
        };
        // Match the dev server's origin before accepting filesystem writes.
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` &&
            request.headers.origin !== `https://${request.headers.host}`)
          return respond(403, { error: 'Cross-origin tactical reviews are not allowed.' });
        try {
          if (request.method === 'GET') {
            const filename = url.pathname.slice(TACTICAL_REVIEW_URL.length + 1);
            if (!filenamePattern.test(filename)) return respond(400, { error: 'Invalid fixture filename.' });
            try { return respond(200, JSON.parse(await readFile(join(directory, filename), 'utf8'))); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return respond(404, { error: 'Review not found.' });
              throw error;
            }
          }
          if (request.method !== 'PUT' || url.pathname !== TACTICAL_REVIEW_URL) {
            response.setHeader('Allow', 'GET, PUT');
            return respond(405, { error: 'Method not allowed.' });
          }
          if (!request.headers['content-type']?.startsWith('application/json'))
            return respond(415, { error: 'Send a JSON tactical review.' });
          const fixture = parseFixture(await requestJson(request));
          const filename = await tacticalReviewFilename(fixture);
          await mkdir(directory, { recursive: true });
          const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
            await rename(temporary, join(directory, filename));
          } finally { await unlink(temporary).catch(() => {}); }
          return respond(200, { filename });
        } catch (error) {
          if (error instanceof InvalidReview) return respond(400, { error: error.message });
          server.config.logger.error(`Could not save/read tactical review: ${String(error)}`);
          return respond(500, { error: 'Could not save or read the tactical review fixture.' });
        }
      });
    },
  };
}

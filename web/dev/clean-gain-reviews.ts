import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { CLEAN_REVIEW_URL, cleanReviewFilename, parseCleanGainReview } from '../src/chess/clean-gain-review';

export function cleanGainReviews(options: { directory?: string } = {}): Plugin {
  return { name: 'clean-gain-reviews', apply: 'serve', configureServer(server) {
    const directory = options.directory ?? join(server.config.root, 'src/fixtures/clean-gain-reviews');
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (pathname !== CLEAN_REVIEW_URL && !pathname.startsWith(`${CLEAN_REVIEW_URL}/`)) return next();
      const respond = (status: number, value: unknown) => {
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(value));
      };
      if (request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin))
        return respond(403, { error: 'Cross-origin reviews are not allowed.' });
      try {
        if (request.method === 'GET') {
          const filename = pathname.slice(CLEAN_REVIEW_URL.length + 1);
          if (!/^[1-9]\d*-[a-f0-9]{64}\.json$/.test(filename)) return respond(400, { error: 'Invalid fixture filename.' });
          try { return respond(200, JSON.parse(await readFile(join(directory, filename), 'utf8'))); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return respond(404, { error: 'Review not found.' });
            throw error;
          }
        }
        if (request.method !== 'PUT' || pathname !== CLEAN_REVIEW_URL) return respond(405, { error: 'Use GET or PUT.' });
        if (!request.headers['content-type']?.startsWith('application/json')) return respond(415, { error: 'Send JSON.' });
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += Buffer.byteLength(chunk);
          if (size > 2_000_000) return respond(413, { error: 'Review is too large.' });
          chunks.push(Buffer.from(chunk));
        }
        let fixture;
        try { fixture = parseCleanGainReview(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { return respond(400, { error: 'Invalid review or engine evidence.' }); }
        const filename = await cleanReviewFilename(fixture);
        await mkdir(directory, { recursive: true });
        const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, `${JSON.stringify(fixture, null, 2)}\n`);
          await rename(temporary, join(directory, filename));
        } finally { await unlink(temporary).catch(() => {}); }
        respond(200, { filename });
      } catch (error) {
        server.config.logger.error(`Clean material review: ${String(error)}`);
        respond(500, { error: 'Could not save or read the review.' });
      }
    });
  } };
}

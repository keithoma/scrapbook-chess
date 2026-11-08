import { parsePgn } from 'chessops/pgn';
import { parseGame } from '../../web/src/game';
import { clockSpeed } from '../../web/src/time-control';
import type { ImportedGame, Platform } from '../../shared/contracts';
import { gameRating, type GameRatings } from '../../shared/ratings';
import { lichessClocks } from '../../shared/clocks';

export class PlatformError extends Error {
  constructor(public code: string) { super(code); }
}
export function username(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{2,30}$/.test(value.trim())) throw new PlatformError('invalid_username');
  return value.trim().toLowerCase();
}
type Json = Record<string, any>;
const MAX_BYTES = 32 * 1024 * 1024;
export class PlatformClient {
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, { etag: string; text: string; bytes: number }>();
  private cachedBytes = 0;
  constructor(private fetcher: typeof fetch = fetch) {}
  async text(url: string, accept = 'application/json'): Promise<string> {
    // All upstream requests, across profiles, are serialized in this process.
    const operation = this.queue.catch(() => {}).then(async () => {
      const cached = this.cache.get(url);
      const headers: Record<string, string> = { Accept: accept, 'User-Agent': 'ScrapbookChess/0.1 (+https://github.com/keithoma/scrapbook-chess)' };
      if (cached) headers['If-None-Match'] = cached.etag;
      let response: Response;
      try { response = await this.fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) }); }
      catch { throw new PlatformError('platform_unavailable'); }
      if (response.status === 304 && cached) return cached.text;
      if (!response.ok) throw new PlatformError(response.status === 429 ? 'rate_limited' : response.status === 404 ? 'account_not_found' : 'platform_unavailable');
      if (!response.body) throw new PlatformError('invalid_platform_response');
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      let text = ''; let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BYTES) throw new PlatformError('response_too_large');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); }
      const etag = response.headers.get('etag');
      if (etag) {
        if (cached) { this.cachedBytes -= cached.bytes; this.cache.delete(url); }
        while (this.cache.size >= 32 || this.cachedBytes + bytes > 64 * 1024 * 1024) {
          const oldest = this.cache.keys().next().value!;
          this.cachedBytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
        }
        this.cache.set(url, { etag, text, bytes }); this.cachedBytes += bytes;
      }
      return text;
    });
    this.queue = operation;
    return operation;
  }
  async json(url: string): Promise<Json> {
    try {
      const value = JSON.parse(await this.text(url));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch (error) { if (error instanceof PlatformError) throw error; throw new PlatformError('invalid_platform_response'); }
  }
}

const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function headers(pgn: string) { return parsePgn(pgn)[0]?.headers; }
function startFromPgn(pgn: string): number {
  const tags = headers(pgn);
  const date = tags?.get('UTCDate') ?? (tags?.get('Timezone') === 'UTC' ? tags.get('Date') : undefined);
  const time = tags?.get('UTCTime') ?? (tags?.get('Timezone') === 'UTC' ? tags.get('StartTime') : undefined);
  if (!date || !time || !/^\d{4}\.\d{2}\.\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return NaN;
  return Date.parse(`${date.replaceAll('.', '-')}T${time}Z`);
}
function legalGame(platform: Platform, sourceId: string, name: string, pgn: string, startedAt: number, finishedAt: number,
  speed: string, timeControl: string, cutoff: number, now: number, ratings: GameRatings, rawClocks?: unknown): ImportedGame | undefined {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || startedAt < cutoff || finishedAt < startedAt || finishedAt > now) return;
  const game = parseGame(pgn);
  if (!['1-0', '0-1', '1/2-1/2'].includes(game.result)) return;
  // Import live standard chess only; preserve original platform speed labels.
  if (!/^\d+(?:\+\d+)?$/.test(timeControl) || speed === 'daily' || speed === 'correspondence') return;
  const color = equal(game.white, name) ? 'white' : equal(game.black, name) ? 'black' : undefined;
  if (!color || equal(game.white, game.black)) return;
  const expected = platform === 'lichess' ? /^https:\/\/lichess\.org\/(?:game\/)?([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:[/?#]|$)/
    : /^https:\/\/(?:www\.)?chess\.com\/game\/(live|daily)\/(\d+)(?:[/?#]|$)/;
  const site = game.site.match(expected);
  if (!site || (platform === 'lichess' ? site[1] : `${site[1]}:${site[2]}`) !== sourceId) return;
  return { id: `${platform}:${sourceId}`, platform, sourceId, username: name, white: game.white, black: game.black,
    color, pgn: game.pgn, startedAt, finishedAt, speed, timeControl, ratings, clocks: platform === 'lichess' ? lichessClocks(rawClocks, game.moves.length) : undefined };
}

export function sourceRatings(platform: Platform, raw: Json): GameRatings {
  const players = platform === 'lichess' ? raw.players ?? {} : raw;
  return { white: gameRating(players.white?.rating, players.white?.provisional), black: gameRating(players.black?.rating, players.black?.provisional) };
}

export interface ImportCandidate { game: ImportedGame; raw: Json }
export async function fetchGames(client: PlatformClient, platform: Platform, name: string, cutoff: number, now: number) {
  name = username(name);
  const candidates: ImportCandidate[] = []; let skipped = 0;
  const add = (raw: Json, normalize: () => ImportedGame | undefined) => {
    try { const game = normalize(); if (game) candidates.push({ game, raw }); else skipped++; }
    catch { skipped++; }
  };
  if (platform === 'lichess') {
    const query = new URLSearchParams({ since: String(cutoff), until: String(now), rated: 'true', pgnInJson: 'true', clocks: 'true',
      opening: 'true', evals: 'false', ongoing: 'false', finished: 'true', sort: 'dateAsc' });
    const text = await client.text(`https://lichess.org/api/games/user/${name}?${query}`, 'application/x-ndjson');
    for (const line of text.split('\n').filter(line => line.trim())) {
      let raw: Json;
      try { raw = JSON.parse(line); } catch { throw new PlatformError('invalid_platform_response'); }
      add(raw, () => {
        if (raw.rated !== true || raw.variant !== 'standard' || typeof raw.speed !== 'string' || !['mate', 'resign', 'stalemate', 'timeout', 'draw', 'outoftime', 'variantEnd'].includes(raw.status)
          || !/^[A-Za-z0-9]{8}$/.test(raw.id) || typeof raw.pgn !== 'string') return;
        for (const side of ['white', 'black']) {
          const player = raw.players?.[side];
          if (!player?.user?.id || !player.user.name || player.aiLevel !== undefined || player.user.title === 'BOT') return;
        }
        if (!clockSpeed(raw.clock?.initial, raw.clock?.increment)) return;
        return legalGame(platform, raw.id, name, raw.pgn, raw.createdAt, raw.lastMoveAt,
          raw.speed, `${raw.clock.initial}+${raw.clock.increment}`, cutoff, now, sourceRatings(platform, raw), raw.clocks);
      });
    }
  } else {
    const listing = await client.json(`https://api.chess.com/pub/player/${name}/games/archives`);
    if (!Array.isArray(listing.archives)) throw new PlatformError('invalid_platform_response');
    const first = new Date(cutoff).toISOString().slice(0, 7).replace('-', '/');
    const last = new Date(now).toISOString().slice(0, 7).replace('-', '/');
    const prefix = `https://api.chess.com/pub/player/${name}/games/`;
    const months = [...new Set(listing.archives.flatMap((url: unknown) => {
      if (typeof url !== 'string') return [];
      const match = url.match(/^https:\/\/api\.chess\.com\/pub\/player\/([a-zA-Z0-9_-]+)\/games\/(\d{4}\/(?:0[1-9]|1[0-2]))$/);
      return match && equal(match[1], name) && match[2] >= first && match[2] <= last ? [`${prefix}${match[2]}`] : [];
    }))].sort() as string[];
    for (const url of months) {
      const monthly = await client.json(url);
      if (!Array.isArray(monthly.games)) throw new PlatformError('invalid_platform_response');
      for (const raw of monthly.games) add(raw, () => {
        if (raw?.rated !== true || raw.rules !== 'chess' || typeof raw.pgn !== 'string' || typeof raw.url !== 'string') return;
        if (!raw.white?.username || !raw.black?.username || raw.white.is_bot || raw.black.is_bot || raw.white.title === 'BOT' || raw.black.title === 'BOT') return;
        const id = raw.url.match(/^https:\/\/(?:www\.)?chess\.com\/game\/(live|daily)\/(\d+)(?:[/?#]|$)/);
        if (!id || id[1] !== 'live') return;
        const tags = headers(raw.pgn);
        if (!equal(tags?.get('White') ?? '', raw.white.username) || !equal(tags?.get('Black') ?? '', raw.black.username)) return;
        return legalGame(platform, `${id[1]}:${id[2]}`, name, raw.pgn, startFromPgn(raw.pgn), raw.end_time * 1000,
          raw.time_class, raw.time_control, cutoff, now, sourceRatings(platform, raw));
      });
    }
  }
  return { candidates, skipped };
}

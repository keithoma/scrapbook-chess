import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { parseGame, withGameClocks } from '../../web/src/game';
import { lichessClocks } from '../../shared/clocks';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import { gameIdentity, prepareGrant, type GameGrant } from '../../web/src/achievements/collection';
import { ANALYSIS_VERSION, DEPTH, type Checkpoint } from '../../web/src/storage';
import { annotateMoves } from '../../web/src/chess/annotations';
import { legalMoveCount } from '../../web/src/chess/legal-moves';
import { TOP_MOVE_COUNT } from '../../web/src/stockfish';
import type { ImportedGame, ImportReport, LinkedAccount, Platform } from '../../shared/contracts';
import { atomic } from './database';
import { fetchGames, PlatformClient, PlatformError, sourceRatings, sourceDrawReason, username } from './platforms';
import { timeZone } from '../../shared/time-zone';

export interface AppOptions {
  db: DatabaseSync; baseURL: string; development: boolean;
  mockLogin?: boolean; mockUsername?: string; mockAgeHours?: number; allowMultipleAccounts?: boolean;
  fetcher?: typeof fetch; now?: () => number;
}
interface AccountRow { id: string; user_id: string; platform: Platform; username: string; verified_at: number | null; development: number }
function platform(value: unknown): Platform {
  if (value !== 'lichess' && value !== 'chesscom') throw new PlatformError('invalid_platform');
  return value;
}
function validateCheckpoint(value: unknown, pgn: string): Checkpoint | undefined {
  if (value === undefined || value === null) return;
  const cp = value as Checkpoint;
  const game = parseGame(pgn);
  if (cp.pgn !== game.pgn || cp.version !== ANALYSIS_VERSION || !Array.isArray(cp.results) || cp.results.length > game.moves.length
    || !Array.isArray(cp.virtual) || cp.virtual.length > 20 || !['pending', 'mate', 'limit', 'terminal'].includes(cp.virtualStatus)) throw new PlatformError('invalid_analysis');
  for (const [i, result] of cp.results.entries()) {
    if (result?.ply !== i + 1 || typeof result.bestMove !== 'string' || result.bestMove.length > 8 || !Number.isFinite(result.ms) || result.ms < 0) throw new PlatformError('invalid_analysis');
    for (const score of [result.best, result.played]) if (!score || !['cp', 'mate'].includes(score.type) || !Number.isFinite(score.value) || Math.abs(score.value) > 1_000_000) throw new PlatformError('invalid_analysis');
    const before = Chess.fromSetup(parseFen(game.frames[i].fen).unwrap()).unwrap();
    const best = parseUci(result.bestMove);
    if (!best || !before.isLegal(best)) throw new PlatformError('invalid_analysis');
    if (result.topMoves !== undefined) {
      if (!Array.isArray(result.topMoves) || result.topMoves.length !== Math.min(TOP_MOVE_COUNT, legalMoveCount(before))) throw new PlatformError('invalid_analysis');
      const seen = new Set<string>();
      for (const pick of result.topMoves) {
        if (!pick || typeof pick.uci !== 'string' || pick.uci.length > 5 || seen.has(pick.uci)
          || !Number.isInteger(pick.depth) || pick.depth < DEPTH || pick.depth > 256
          || pick.depth !== result.topMoves[0].depth
          || !pick.score || !['cp', 'mate'].includes(pick.score.type)
          || !Number.isFinite(pick.score.value) || Math.abs(pick.score.value) > 1_000_000) throw new PlatformError('invalid_analysis');
        const move = parseUci(pick.uci);
        if (!move || !before.isLegal(move)) throw new PlatformError('invalid_analysis');
        seen.add(pick.uci);
      }
      const first = result.topMoves[0];
      const played = result.topMoves.find(pick => pick.uci === game.moves[i].uci);
      if (first.uci !== result.bestMove || first.score.type !== result.best.type || first.score.value !== result.best.value
        || (played && (played.score.type !== result.played.type || played.score.value !== result.played.value))) throw new PlatformError('invalid_analysis');
    }
  }
  if (cp.virtual.some(move => !move || typeof move.san !== 'string' || move.san.length > 16 || typeof move.uci !== 'string'
    || move.uci.length > 8 || typeof move.fen !== 'string' || move.fen.length > 128)) throw new PlatformError('invalid_analysis');
  if (cp.virtual.length && cp.results.length !== game.moves.length) throw new PlatformError('invalid_analysis');
  const pos = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
  for (const step of cp.virtual) {
    const move = parseUci(step.uci);
    if (pos.isEnd() || !move || !pos.isLegal(move) || makeSanAndPlay(pos, move) !== step.san || makeFen(pos.toSetup()) !== step.fen) throw new PlatformError('invalid_analysis');
  }
  if (cp.virtualStatus === 'mate' && (!cp.virtual.length || !pos.isCheckmate()
    || cp.virtualWinner !== (pos.turn === 'white' ? 'black' : 'white'))) throw new PlatformError('invalid_analysis');
  if (cp.virtualStatus === 'limit' && (cp.virtual.length !== 20 || pos.isEnd())) throw new PlatformError('invalid_analysis');
  if (cp.virtualStatus === 'terminal' && !pos.isEnd()) throw new PlatformError('invalid_analysis');
  return { key: '', pgn: game.pgn, version: cp.version, results: annotateMoves(game, cp.results), virtual: cp.virtual,
    virtualStatus: cp.virtualStatus, virtualWinner: cp.virtualWinner, updatedAt: new Date().toISOString() };
}
export async function createApp(options: AppOptions) {
  if (!options.development && (options.allowMultipleAccounts || options.mockLogin)) throw new Error('Development account flags are forbidden in production.');
  const mockName = username(options.mockUsername ?? 'noctu2nality');
  const ageHours = options.mockAgeHours ?? 8;
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > 8760) throw new Error('Invalid mock profile age.');
  const { db } = options; const now = options.now ?? Date.now;
  const origin = new URL(options.baseURL).origin;
  const client = new PlatformClient(options.fetcher);
  const app = new Hono();
  const jobs = new Map<string, Promise<ImportReport[]>>();
  const lastChecks = new Map<string, number>();
  app.use('/api/*', bodyLimit({ maxSize: 4 * 1024 * 1024 }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('Origin') !== origin) return c.json({ error: 'invalid_origin' }, 403);
    await next();
  });
  app.onError((error, c) => c.json({ error: error instanceof PlatformError ? error.code : error instanceof SyntaxError ? 'invalid_request' : 'server_error' }, error instanceof PlatformError || error instanceof SyntaxError ? 400 : 500));
  app.get('/api/health', c => c.json({ ok: true }));
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  async function session(request: Request) {
    if (!options.mockLogin) return null;
    const token = request.headers.get('cookie')?.match(/(?:^|;\s*)scrapbook_mock=([a-zA-Z0-9_-]+)/)?.[1];
    if (!token) return null;
    const row = db.prepare(`SELECT p.id,p.name,p.created_at,p.time_zone FROM profiles p JOIN mock_sessions s ON s.user_id=p.id
      WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token), now());
    return row ? { user: { id: row.id as string, name: row.name as string, createdAt: row.created_at as number, timeZone: row.time_zone as string } } : null;
  }
  app.post('/api/mock-login', async c => {
    if (!options.mockLogin) return c.json({ error: 'mock_login_disabled' }, 403);
    const id = `mock:${mockName}`;
    const payload = await c.req.text(); const body = payload ? JSON.parse(payload) : {};
    const zone = timeZone(body?.timeZone ?? 'UTC');
    if (!zone) throw new PlatformError('invalid_timezone');
    atomic(db, () => {
      const added = db.prepare('INSERT OR IGNORE INTO profiles (id,name,created_at,time_zone) VALUES (?,?,?,?)').run(id, mockName, now() - ageHours * 3600_000, zone);
      if (added.changes) db.prepare('INSERT INTO linked_accounts (id,user_id,platform,username,development) VALUES (?,?,?,?,1)')
        .run(randomUUID(), id, 'lichess', mockName);
    });
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM mock_sessions WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO mock_sessions VALUES (?,?,?)').run(hash(token), id, now() + 14 * 86400_000);
    setCookie(c, 'scrapbook_mock', token, { httpOnly: true, sameSite: 'Lax', secure: origin.startsWith('https:'), path: '/', maxAge: 14 * 86400 });
    return c.json({ ok: true });
  });
  app.post('/api/logout', c => {
    const token = getCookie(c, 'scrapbook_mock');
    if (token) db.prepare('DELETE FROM mock_sessions WHERE token_hash=?').run(hash(token));
    deleteCookie(c, 'scrapbook_mock', { path: '/' });
    return c.json({ ok: true });
  });
  function accounts(userId: string) { return db.prepare('SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY rowid').all(userId) as unknown as AccountRow[]; }
  function publicAccount(row: AccountRow): LinkedAccount {
    return { id: row.id, platform: row.platform, username: row.username, verified: row.verified_at !== null,
      development: !!row.development };
  }
  function games(userId: string): ImportedGame[] {
    return db.prepare(`SELECT g.game_json, g.raw_json, c.game_id AS collected, a.game_id AS analyzed FROM imported_games g
      LEFT JOIN collections c ON c.user_id=g.user_id AND c.game_id=g.game_id
      LEFT JOIN analyses a ON a.user_id=g.user_id AND a.game_id=g.game_id WHERE g.user_id=? ORDER BY g.imported_at DESC`).all(userId)
      .map(row => ({ ...readImported(row), collected: !!row.collected, analyzed: !!row.analyzed }));
  }
  function readImported(row: Record<string, unknown>): ImportedGame {
    const game = JSON.parse(row.game_json as string) as ImportedGame;
    // Imports made before rating badges already retained the original payload.
    // Recover historical evidence without fetching today's profile ratings.
    game.ratings ??= sourceRatings(game.platform, JSON.parse(row.raw_json as string));
    if (game.platform === 'lichess' && game.clocks === undefined) game.clocks = lichessClocks(JSON.parse(row.raw_json as string).clocks, parseGame(game.pgn).moves.length);
    if (game.platform === 'chesscom' && game.clocks === undefined) game.clocks = parseGame(game.pgn).moves.map(move => move.clock ?? null);
    game.drawReason ??= sourceDrawReason(game.platform, JSON.parse(row.raw_json as string));
    return game;
  }
  function collection(userId: string): GameGrant[] { return db.prepare('SELECT grant_json FROM collections WHERE user_id=?').all(userId).map(row => JSON.parse(row.grant_json as string)); }
  app.get('/api/me', async c => {
    const signed = await session(c.req.raw);
    return c.json({ user: signed ? { id: signed.user.id, name: signed.user.name, createdAt: new Date(signed.user.createdAt).getTime(), timeZone: signed.user.timeZone } : null,
      accounts: signed ? accounts(signed.user.id).map(publicAccount) : [], games: signed ? games(signed.user.id) : [],
      localAccountTesting: !!options.mockLogin, mockLogin: !!options.mockLogin, multipleAccounts: !!options.allowMultipleAccounts });
  });
  app.use('/api/profile/*', async (c, next) => { if (!await session(c.req.raw)) return c.json({ error: 'sign_in_required' }, 401); await next(); });
  app.put('/api/profile/settings', async c => {
    const signed = (await session(c.req.raw))!;
    const body = await c.req.json(); const zone = timeZone(body.timeZone);
    if (!zone) throw new PlatformError('invalid_timezone');
    db.prepare('UPDATE profiles SET time_zone=? WHERE id=?').run(zone, signed.user.id);
    return c.json({ timeZone: zone });
  });
  app.post('/api/profile/accounts', async c => {
    const signed = (await session(c.req.raw))!;
    const body = await c.req.json(); const source = platform(body.platform); const name = username(body.username);
    if (!options.mockLogin) return c.json({ error: 'development_only' }, 403);
    const added = atomic(db, () => {
      if (!options.allowMultipleAccounts && accounts(signed.user.id).some(row => row.platform === source)) throw new PlatformError('one_account_per_platform');
      if (accounts(signed.user.id).some(row => row.platform === source && row.username === name)) throw new PlatformError('account_already_linked');
      const id = randomUUID();
      db.prepare('INSERT INTO linked_accounts (id,user_id,platform,username,development) VALUES (?,?,?,?,?)')
        .run(id, signed.user.id, source, name, 1);
      return accounts(signed.user.id).find(row => row.id === id)!;
    });
    return c.json(publicAccount(added), 201);
  });
  app.delete('/api/profile/accounts/:id', async c => {
    const signed = (await session(c.req.raw))!;
    db.prepare('DELETE FROM linked_accounts WHERE id=? AND user_id=?').run(c.req.param('id'), signed.user.id);
    return c.json({ ok: true });
  });
  app.post('/api/profile/check-games', async c => {
    const signed = (await session(c.req.raw))!;
    if (jobs.has(signed.user.id)) return c.json({ reports: await jobs.get(signed.user.id) });
    if (now() - (lastChecks.get(signed.user.id) ?? 0) < 10_000) return c.json({ error: 'check_cooldown' }, 429);
    lastChecks.set(signed.user.id, now());
    const task = (async () => {
      const reports: ImportReport[] = [];
      for (const row of accounts(signed.user.id)) {
        const report: ImportReport = { accountId: row.id, platform: row.platform, username: row.username, imported: 0, skipped: 0 };
        try {
          if (!row.verified_at && !row.development) throw new PlatformError('verify_account_first');
          const result = await fetchGames(client, row.platform, row.username, new Date(signed.user.createdAt).getTime(), now());
          report.skipped = result.skipped;
          atomic(db, () => {
            // Recheck ownership after network I/O: unlinking cancels this import.
            if (!accounts(signed.user.id).some(account => account.id === row.id)) throw new PlatformError('account_not_found');
            for (const { game, raw } of result.candidates) {
              const inserted = db.prepare('INSERT OR IGNORE INTO imported_games (user_id,game_id,account_id,game_json,raw_json,imported_at) VALUES (?,?,?,?,?,?)')
                .run(signed.user.id, game.id, row.id, JSON.stringify(game), JSON.stringify(raw), now());
              report.imported += Number(inserted.changes);
              if (!inserted.changes && game.clocks?.every(value => value !== null && Number.isFinite(value))) {
                const old = db.prepare('SELECT game_json, raw_json FROM imported_games WHERE user_id=? AND game_id=?').get(signed.user.id, game.id)!;
                const existing = readImported(old);
                if (!existing.clocks || existing.clocks.length !== game.clocks.length || existing.clocks.some(value => value === null || !Number.isFinite(value))) {
                  existing.clocks = game.clocks;
                  db.prepare('UPDATE imported_games SET game_json=?,raw_json=? WHERE user_id=? AND game_id=?')
                    .run(JSON.stringify(existing), JSON.stringify(raw), signed.user.id, game.id);
                }
              }
            }
          });
        } catch (error) { report.error = error instanceof PlatformError ? error.code : 'import_failed'; }
        reports.push(report);
      }
      return reports;
    })();
    jobs.set(signed.user.id, task);
    try { return c.json({ reports: await task }); } finally { jobs.delete(signed.user.id); }
  });
  app.get('/api/profile/collection', async c => c.json(collection((await session(c.req.raw))!.user.id)));
  app.get('/api/profile/games/:id/analysis', async c => {
    const signed = (await session(c.req.raw))!;
    const row = db.prepare('SELECT checkpoint_json FROM analyses WHERE user_id=? AND game_id=?').get(signed.user.id, c.req.param('id'));
    return c.json(row ? JSON.parse(row.checkpoint_json as string) : null);
  });
  app.on(['PUT', 'POST'], ['/api/profile/games/:id/analysis', '/api/profile/games/:id/collect'], async c => {
    if ((c.req.path.endsWith('/analysis') && c.req.method !== 'PUT') || (c.req.path.endsWith('/collect') && c.req.method !== 'POST')) return c.json({ error: 'method_not_allowed' }, 405);
    const signed = (await session(c.req.raw))!;
    const row = db.prepare('SELECT game_json, raw_json FROM imported_games WHERE user_id=? AND game_id=?').get(signed.user.id, c.req.param('id'));
    if (!row) return c.json({ error: 'imported_game_required' }, 404);
    const imported = readImported(row);
    const body = await c.req.json(); const checkpoint = validateCheckpoint(body.checkpoint, imported.pgn);
    return c.json(atomic(db, () => {
      if (checkpoint && (checkpoint.results.length || checkpoint.virtual.length)) {
        const previous = db.prepare('SELECT checkpoint_json FROM analyses WHERE user_id=? AND game_id=?').get(signed.user.id, imported.id);
        const saved = previous ? JSON.parse(previous.checkpoint_json as string) as Checkpoint : undefined;
        if (!saved || saved.results.length < checkpoint.results.length || (saved.results.length === checkpoint.results.length
          && saved.results.filter(result => result.topMoves?.length).length <= checkpoint.results.filter(result => result.topMoves?.length).length)) {
          db.prepare('INSERT INTO analyses VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET checkpoint_json=excluded.checkpoint_json').run(signed.user.id, imported.id, JSON.stringify(checkpoint));
        }
      }
      if (c.req.path.endsWith('/analysis')) return { ok: true };
      const before = collection(signed.user.id);
      const game = withGameClocks(parseGame(imported.pgn), imported.clocks);
      game.timeControl = imported.timeControl;
      game.ratings = imported.ratings ?? {};
      game.startedAt = imported.startedAt;
      game.drawReason = imported.drawReason ?? game.drawReason;
      game.timeZone = signed.user.timeZone;
      if (gameIdentity(game) !== imported.id) throw new PlatformError('invalid_platform_response');
      const grant = prepareGrant(before, game, imported.color, checkpoint, new Date(now()).toISOString());
      grant.source = { platform: imported.platform, username: imported.username };
      db.prepare('INSERT INTO collections VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET grant_json=excluded.grant_json')
        .run(signed.user.id, imported.id, JSON.stringify(grant));
      return { before, after: [...before.filter(entry => entry.id !== grant.id), grant], grant };
    }));
  });
  app.all('/api/*', c => c.json({ error: 'not_found' }, 404));
  return app;
}

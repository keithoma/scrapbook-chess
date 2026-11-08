import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformClient, fetchGames } from '../dist/platforms.js';
import { sample, upstream, NOW } from './fixtures.mjs';

test('both adapters preserve PGN/raw evidence, platform IDs, clocks, and player color', async () => {
  const client = new PlatformClient(upstream());
  const lichess = await fetchGames(client, 'lichess', 'NOCTU2NALITY', NOW - 8 * 3600_000, NOW);
  assert.equal(lichess.candidates[0].game.id, 'lichess:Mock0001');
  assert.equal(lichess.candidates[0].game.color, 'black');
  assert.deepEqual(lichess.candidates[0].raw.clocks, [60000, 59000, 58000, 57000]);
  const chess = await fetchGames(client, 'chesscom', 'testchess', NOW - 8 * 3600_000, NOW);
  assert.equal(chess.candidates[0].game.id, 'chesscom:live:999001');
  assert.equal(chess.candidates[0].game.color, 'black');
  assert.match(chess.candidates[0].game.pgn, /\[Site "Chess.com"\]/);
});
test('Lichess filters old, bot, casual, ongoing, variant, unrelated, and malformed games', async () => {
  const valid = sample();
  const bot = structuredClone(valid); bot.players.white.user.title = 'BOT';
  const records = [valid, sample('lichess', { age: 9 * 3600_000 }), bot, { ...valid, rated: false },
    { ...valid, status: 'started' }, { ...valid, variant: 'chess960' }, sample('lichess', { name: 'somebodyelse' }),
    { ...valid, pgn: valid.pgn.replace('Qh4#', 'Qa7') }, { ...valid, clock: undefined },
    { ...valid, clock: { initial: -30, increment: 0 } }, { ...valid, clock: { initial: '30', increment: 0 } }];
  const result = await fetchGames(new PlatformClient(upstream({ lichess: records })), 'lichess', 'noctu2nality', NOW - 8 * 3600_000, NOW);
  assert.equal(result.candidates.length, 1); assert.equal(result.skipped, records.length - 1);
});
test('Chess.com filters old, daily, bots, variants, and missing start times instead of guessing', async () => {
  const valid = sample('chesscom', { name: 'testchess' });
  const records = [valid, sample('chesscom', { name: 'testchess', age: 9 * 3600_000 }), { ...valid, rated: false },
    { ...valid, rules: 'chess960' }, { ...valid, time_class: 'daily' }, { ...valid, white: { ...valid.white, is_bot: true } },
    { ...valid, pgn: valid.pgn.replace(/\[UTCDate[^\n]+\n/, '') }];
  const result = await fetchGames(new PlatformClient(upstream({ chesscom: records })), 'chesscom', 'testchess', NOW - 8 * 3600_000, NOW);
  assert.equal(result.candidates.length, 1); assert.equal(result.skipped, records.length - 1);
});
test('monthly archives are serial, span the signup month boundary, and reject foreign URLs', async () => {
  const calls = []; let active = 0;
  const client = new PlatformClient(async url => {
    assert.equal(active++, 0); calls.push(url);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return Response.json(url.endsWith('archives') ? { archives: [
      'https://api.chess.com/pub/player/testchess/games/2026/10', 'https://api.chess.com/pub/player/testchess/games/2026/11',
      'https://evil.example/secret', 'https://api.chess.com/pub/player/other/games/2026/11',
    ] } : { games: [] });
  });
  await fetchGames(client, 'chesscom', 'testchess', Date.UTC(2026, 9, 31, 20), Date.UTC(2026, 10, 1, 2));
  assert.equal(calls.length, 3); assert.match(calls[1], /2026\/10$/); assert.match(calls[2], /2026\/11$/);
});
test('late Chess.com publications remain discoverable on a later manual check', async () => {
  let games = [];
  const client = new PlatformClient(async url => Response.json(url.endsWith('archives') ? { archives: ['https://api.chess.com/pub/player/testchess/games/2026/11'] } : { games }));
  assert.equal((await fetchGames(client, 'chesscom', 'testchess', NOW - 8 * 3600_000, NOW)).candidates.length, 0);
  games = [sample('chesscom', { name: 'testchess' })];
  assert.equal((await fetchGames(client, 'chesscom', 'testchess', NOW - 8 * 3600_000, NOW)).candidates.length, 1);
});
test('429 and malformed responses fail visibly and do not poison subsequent requests', async () => {
  let status = 429;
  const client = new PlatformClient(async () => new Response(status === 429 ? 'Slow down' : '{bad json', { status }));
  await assert.rejects(client.json('https://api.chess.com/test'), /rate_limited/);
  status = 200; await assert.rejects(client.json('https://api.chess.com/test'), /invalid_platform_response/);
});
test('independent requests share the serial queue and conditional requests reuse a 304 response', async () => {
  let active = 0; let cached = false;
  const client = new PlatformClient(async (url, options) => {
    assert.equal(active++, 0);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (url.endsWith('/cached') && cached) {
      assert.equal(options.headers['If-None-Match'], 'version-one');
      return new Response(null, { status: 304 });
    }
    if (url.endsWith('/cached')) cached = true;
    return Response.json({ ok: true }, { headers: { ETag: 'version-one' } });
  });
  await Promise.all([client.json('https://api.chess.com/a'), client.json('https://api.chess.com/b')]);
  assert.deepEqual(await client.json('https://api.chess.com/cached'), { ok: true });
  assert.deepEqual(await client.json('https://api.chess.com/cached'), { ok: true });
});

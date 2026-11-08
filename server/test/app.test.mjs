import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/app.js';
import { openDatabase } from '../dist/database.js';
import { NOW, sample, upstream } from './fixtures.mjs';

const baseURL = 'http://127.0.0.1:5173';
async function setup(extra = {}) {
  let clock = NOW;
  const db = openDatabase(':memory:');
  const options = { db, baseURL, development: true, mockLogin: true, mockUsername: 'noctu2nality', mockAgeHours: 8, fetcher: upstream(), now: () => clock, ...extra };
  const app = await createApp(options);
  let cookie = '';
  async function request(path, method = 'GET', body, useCookie = cookie, origin = baseURL) {
    return app.request(`${baseURL}/api${path}`, { method, headers: { Origin: origin, Cookie: useCookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function login() { const response = await request('/mock-login', 'POST', {}); assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0]; return cookie; }
  return { db, app, options, request, login, advance: ms => { clock += ms; } };
}

test('mock login auto-links Lichess, backdates exactly eight hours, and preserves its date on later logins', async () => {
  const s = await setup();
  await s.login();
  const first = await (await s.request('/me')).json();
  assert.equal(first.user.name, 'noctu2nality'); assert.equal(first.user.createdAt, NOW - 8 * 3600_000);
  assert.equal(first.accounts[0].platform, 'lichess'); assert.equal(first.accounts[0].username, 'noctu2nality');
  s.advance(3600_000); await s.login();
  const next = await (await s.request('/me')).json();
  assert.equal(next.user.createdAt, first.user.createdAt); assert.equal(next.accounts.length, 1);
  s.db.close();
});
test('production rejects mock/multiple-account flags, ignores mock cookies, and exposes no profile data', async () => {
  const s = await setup(); const cookie = await s.login();
  await assert.rejects(createApp({ ...s.options, development: false }), /forbidden in production/);
  await assert.rejects(createApp({ ...s.options, development: false, mockLogin: false, allowMultipleAccounts: true }), /forbidden in production/);
  const production = await createApp({ ...s.options, development: false, mockLogin: false });
  const me = await (await production.request(`${baseURL}/api/me`, { headers: { Cookie: cookie } })).json();
  assert.equal(me.user, null); assert.deepEqual(me.games, []);
  assert.equal((await production.request(`${baseURL}/api/mock-login`, { method: 'POST', headers: { Origin: baseURL } })).status, 403);
  assert.equal((await production.request(`${baseURL}/api/profile/collection`, { headers: { Cookie: cookie } })).status, 401);
  s.db.close();
});
test('import retries and concurrent checks do not duplicate games; source failure preserves other platforms', async () => {
  const s = await setup(); await s.login();
  assert.equal((await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' })).status, 201);
  const checks = await Promise.all([s.request('/profile/check-games', 'POST', {}), s.request('/profile/check-games', 'POST', {})]);
  for (const check of checks) assert.equal(check.status, 200);
  let me = await (await s.request('/me')).json(); assert.equal(me.games.length, 2);
  s.advance(11_000);
  const reports = await (await s.request('/profile/check-games', 'POST', {})).json();
  assert.equal(reports.reports.reduce((sum, item) => sum + item.imported, 0), 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM imported_games').get().n, 2);
  assert.deepEqual(JSON.parse(s.db.prepare('SELECT raw_json FROM imported_games WHERE game_id=?').get('lichess:Mock0001').raw_json).clocks, sample().clocks);
  s.db.close();
  const failed = await setup({ fetcher: upstream({ lichessStatus: 429 }) }); await failed.login();
  await failed.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  const partial = await (await failed.request('/profile/check-games', 'POST', {})).json();
  assert.equal(partial.reports[0].error, 'rate_limited'); assert.equal(partial.reports[1].imported, 1);
  failed.db.close();
});
test('one account per platform is enforced, with an explicit development override and same-game deduplication', async () => {
  const s = await setup(); await s.login();
  assert.equal((await s.request('/profile/accounts', 'POST', { platform: 'lichess', username: 'opponent' })).status, 400);
  s.db.close();
  const multiple = await setup({ allowMultipleAccounts: true }); await multiple.login();
  assert.equal((await multiple.request('/profile/accounts', 'POST', { platform: 'lichess', username: 'opponent' })).status, 201);
  await multiple.request('/profile/check-games', 'POST', {});
  const me = await (await multiple.request('/me')).json();
  assert.equal(me.games.length, 1); assert.equal(me.games[0].color, 'black');
  multiple.db.close();
});
test('the server derives rewards from imported PGN, ignores forged balances/colors, and isolates profile collections', async () => {
  const s = await setup(); await s.login(); await s.request('/profile/check-games', 'POST', {});
  const path = '/profile/games/lichess%3AMock0001/collect';
  const replies = await Promise.all([s.request(path, 'POST', { color: 'white', events: [{ amount: 999999 }] }), s.request(path, 'POST', {})]);
  for (const response of replies) assert.equal(response.status, 200);
  const records = await (await s.request('/profile/collection')).json();
  assert.equal(records.length, 1); assert.equal(records[0].color, 'black');
  assert.equal(records[0].events.filter(event => event.badgeId === 'badge_moves_played').reduce((sum, event) => sum + event.amount, 0), 2);
  assert.deepEqual(records[0].events.filter(event => ['badge_won_total', 'badge_total_checks'].includes(event.badgeId)), [
    { kind: 'badge', badgeId: 'badge_won_total', amount: 1, ply: 4 },
    { kind: 'badge', badgeId: 'badge_total_checks', amount: 1, ply: 4 },
  ]);
  assert.equal(records[0].events.find(event => event.kind === 'scrap').notation, 'Qh4#');
  assert.equal(records[0].source.platform, 'lichess');
  assert.equal((await s.request('/profile/games/made-up/collect', 'POST', {})).status, 404);
  assert.equal((await s.request('/profile/collection', 'GET', undefined, '')).status, 401);
  const other = await createApp({ ...s.options, mockUsername: 'another-user' });
  const login = await other.request(`${baseURL}/api/mock-login`, { method: 'POST', headers: { Origin: baseURL } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await other.request(`${baseURL}/api/profile/collection`, { headers: { Cookie: cookie } })).json(), []);
  s.db.close();
});
test('recollecting an older profile record activates new badges without duplicating its saved rewards', async () => {
  const s = await setup(); await s.login(); await s.request('/profile/check-games', 'POST', {});
  const path = '/profile/games/lichess%3AMock0001/collect';
  await s.request(path, 'POST', {});
  const row = s.db.prepare('SELECT * FROM collections').get();
  const oldGrant = JSON.parse(row.grant_json);
  oldGrant.events = oldGrant.events.filter(event => !['badge_won_total', 'badge_total_checks', 'badge_material_total', 'badge_promotion'].includes(event.badgeId));
  s.db.prepare('UPDATE collections SET grant_json=? WHERE user_id=? AND game_id=?').run(JSON.stringify(oldGrant), row.user_id, row.game_id);
  const updated = (await (await s.request(path, 'POST', {})).json()).grant;
  assert.equal(updated.collectedAt, oldGrant.collectedAt);
  assert.equal(updated.events.find(event => event.badgeId === 'badge_won_total').amount, 1);
  assert.equal(updated.events.find(event => event.badgeId === 'badge_total_checks').amount, 1);
  assert.deepEqual(updated.events.filter(event => event.kind === 'scrap'), oldGrant.events.filter(event => event.kind === 'scrap'));
  const repeated = (await (await s.request(path, 'POST', {})).json()).grant;
  assert.deepEqual(repeated.events, updated.events);
  assert.equal((await (await s.request('/profile/collection')).json()).length, 1);
  s.db.close();
});
test('analysis survives a new browser session; malformed evidence and cross-origin writes are rejected', async () => {
  const s = await setup(); const cookie = await s.login(); await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json();
  const checkpoint = { key: 'client-key', version: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1', pgn: me.games[0].pgn,
    results: ['f2f3', 'e7e5', 'g2g4', 'd8h4'].map((bestMove, index) => ({ ply: index + 1, bestMove, best: { type: 'cp', value: 0 }, played: { type: 'cp', value: 0 }, ms: 1 })),
    virtual: [], virtualStatus: 'terminal', updatedAt: '' };
  const path = '/profile/games/lichess%3AMock0001/analysis';
  assert.equal((await s.request(path, 'PUT', { checkpoint })).status, 200);
  assert.equal((await (await s.request(path)).json()).results.length, 4);
  const nextApp = await createApp(s.options);
  const restored = await nextApp.request(`${baseURL}/api${path}`, { headers: { Cookie: cookie } });
  assert.equal((await restored.json()).results.length, 4);
  assert.equal((await s.request(path, 'PUT', { checkpoint: { ...checkpoint, pgn: '1. e4 *' } })).status, 400);
  assert.equal((await s.request(path, 'PUT', { checkpoint: { ...checkpoint, results: [{ ...checkpoint.results[0], bestMove: 'e2e8' }] } })).status, 400);
  assert.equal((await (await s.request(path)).json()).results.length, 4);
  assert.equal((await s.request(path, 'PUT', { checkpoint: { ...checkpoint, virtual: [{ san: 'Qh4#', uci: 'e1e8', fen: 'invalid' }] } })).status, 400);
  assert.equal((await s.request('/mock-login', 'POST', {}, '', 'https://evil.example')).status, 403);
  await s.request('/logout', 'POST', {});
  assert.equal((await s.request('/profile/collection')).status, 401);
  s.db.close();
});
test('profile collection uses the same YAML mastery rules and preserves XP without its browser checkpoint', async () => {
  const raw = sample('lichess', { id: 'Fork0001' });
  raw.pgn = raw.pgn.replace('[White "Opponent"]', '[White "noctu2nality"]').replace('[Black "noctu2nality"]', '[Black "Opponent"]')
    .replaceAll('0-1', '1-0').replace('1. f3 e5 2. g4 Qh4# 1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 a6 4. Ng5 b6 5. Nxf7 1-0');
  raw.players = { white: { user: { id: 'noctu2nality', name: 'noctu2nality' } }, black: { user: { id: 'opponent', name: 'Opponent' } } };
  raw.status = 'resign';
  const s = await setup({ fetcher: upstream({ lichess: [raw] }) });
  await s.login(); await s.request('/profile/check-games', 'POST', {});
  const checkpoint = { pgn: raw.pgn, version: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1',
    results: ['e2e4','e7e5','g1f3','b8c6','f1c4','a7a6','f3g5','b7b6','g5f7'].map((bestMove, i) => ({ ply: i + 1, bestMove, best: { type: 'cp', value: 0 }, played: { type: 'cp', value: 0 }, ms: 1 })),
    virtual: [], virtualStatus: 'pending' };
  const path = '/profile/games/lichess%3AFork0001/collect';
  const response = await s.request(path, 'POST', { checkpoint }); assert.equal(response.status, 200);
  const award = (await response.json()).grant.events.find(event => event.kind === 'mastery');
  assert.equal(award.amount, 137); assert.equal(award.ply, 9);
  const recollect = await (await s.request(path, 'POST', {})).json();
  assert.deepEqual(recollect.grant.events.find(event => event.kind === 'mastery'), award);
  s.db.close();
});
test('both platforms earn mileage from Lichess clock boundaries rather than source speed labels', async () => {
  const lichess = sample('lichess', { id: 'Speed001' });
  lichess.pgn = lichess.pgn.replace('600+0', '900+15');
  const chesscom = sample('chesscom', { id: '999002', name: 'testchess' });
  chesscom.pgn = chesscom.pgn.replace('600+0', '300+5');
  chesscom.time_control = '300+5'; chesscom.time_class = 'blitz';
  const s = await setup({ fetcher: upstream({ lichess: [lichess], chesscom: [chesscom] }) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json();
  assert.equal(me.games.length, 2);
  for (const game of me.games) {
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const response = await s.request(path, 'POST', {});
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    const expected = game.platform === 'lichess' ? 'badge_played_classical' : 'badge_played_rapid';
    assert.deepEqual(grant.events.filter(event => event.kind === 'badge' && event.badgeId.startsWith('badge_played_') && event.badgeId !== 'badge_played_total'), [
      { kind: 'badge', badgeId: expected, amount: 1, ply: 4 },
    ]);
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
  }
  s.db.close();
});

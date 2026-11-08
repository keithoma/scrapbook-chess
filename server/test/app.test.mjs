import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../dist/app.js';
import { openDatabase } from '../dist/database.js';
import { NOW, sample, upstream } from './fixtures.mjs';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';

const baseURL = 'http://127.0.0.1:5173';
test('both providers recover missing Jobava clocks and collect the browser-equivalent opening award once', async () => {
  const source = readFileSync(new URL('../../web/src/fixtures/games/jobava.pgn', import.meta.url), 'utf8');
  const moves = source.trim().split('\n\n')[1];
  const clockless = moves.replace(/\s*\{[^}]+\}/g, '');
  const clocks = [...moves.matchAll(/%clk 0:(\d+):(\d+)/g)].map(m => (Number(m[1]) * 60 + Number(m[2])) * 100);
  const make = (platform, name, withClocks) => {
    const raw = sample(platform, { name });
    raw.pgn = raw.pgn.replaceAll('0-1', '1-0').replace('1. f3 e5 2. g4 Qh4# 1-0', withClocks ? moves : clockless);
    if (platform === 'lichess') { raw.status = 'resign'; raw.clocks = withClocks ? clocks : undefined; }
    return raw;
  };
  let recovered = false;
  const s = await setup({ fetcher: input => upstream({
    lichess: [make('lichess', 'noctu2nality', recovered)],
    chesscom: [make('chesscom', 'testchess', recovered)],
  })(input) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const first = await (await s.request('/me')).json();
  assert.equal(first.games.length, 2);
  const checkpoints = new Map();
  for (const game of first.games) {
    const parsed = parsePgn(game.pgn)[0];
    const pos = startingPosition(parsed.headers).unwrap();
    const results = [];
    for (const node of parsed.moves.mainline()) {
      const move = parseSan(pos, node.san);
      results.push({ ply: results.length + 1, bestMove: makeUci(move), best: { type: 'cp', value: 0 }, played: { type: 'cp', value: 0 }, ms: 1 });
      pos.play(move);
    }
    const checkpoint = { pgn: game.pgn, version: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1', results, virtual: [], virtualStatus: 'pending' };
    checkpoints.set(game.id, checkpoint);
    const response = await s.request(`/profile/games/${encodeURIComponent(game.id)}/collect`, 'POST', { checkpoint });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).grant.events.some(e => e.family === 'opening'), false);
  }
  recovered = true; s.advance(60_000);
  const checked = await s.request('/profile/check-games', 'POST', {});
  const report = await checked.json();
  assert.equal(checked.status, 200, JSON.stringify(report));
  assert.ok(report.reports.every(r => r.imported === 0));
  const second = await (await s.request('/me')).json();
  assert.equal(second.games.length, 2);
  for (const game of second.games) {
    assert.equal(game.pgn, first.games.find(g => g.id === game.id).pgn);
    assert.deepEqual(game.clocks, clocks.map(c => c / 100));
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const response = await s.request(path, 'POST', { checkpoint: checkpoints.get(game.id) });
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    const opening = grant.events.filter(e => e.family === 'opening');
    assert.ok(opening.every(e => e.masteryId === 'mastery_rapport_jobava_black'));
    assert.equal(opening.reduce((sum, e) => sum + e.amount, 0), 392);
    assert.equal(opening.filter(e => e.grade).length, 1);
    assert.equal(opening.find(e => e.grade).grade, 'S+');
    const retry = await (await s.request(path, 'POST', {})).json();
    assert.deepEqual(retry.grant.events, grant.events);
  }
  s.db.close();
});
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

test('clock badges use API centiseconds for Lichess and PGN clocks for chess.com, with retries counted once', async () => {
  const lichess = sample('lichess', { id: 'Time0001' }); lichess.clocks = [59000, 59800, 58000, 59500];
  const chesscom = sample('chesscom', { id: '999051', name: 'testchess' });
  chesscom.pgn = chesscom.pgn.replace('1. f3 e5 2. g4 Qh4#', '1. f3 {[%clk 0:09:50]} e5 {[%clk 0:09:58]} 2. g4 {[%clk 0:09:40]} Qh4# {[%clk 0:09:55]}');
  const s = await setup({ fetcher: upstream({ lichess: [lichess], chesscom: [chesscom] }) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' }); await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json(); assert.equal(me.games.length, 2);
  for (const game of me.games) {
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const grant = (await (await s.request(path, 'POST', {})).json()).grant;
    assert.deepEqual(grant.events.filter(event => event.badgeId === 'badge_time_advantage'), [{ kind: 'badge', badgeId: 'badge_time_advantage', amount: 1, ply: 4 }]);
    assert.deepEqual(grant.clocks, [590, 598, 580, 595]);
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
  }
  s.db.close();
});

test('settings save a validated profile timezone, preserve the collection cutoff, and freeze calendar evidence', async () => {
  const raw = sample('lichess', { now: Date.UTC(2026, 10, 9, 1), age: 1.5 * 3600_000 });
  const s = await setup({ now: () => Date.UTC(2026, 10, 9, 1), fetcher: upstream({ lichess: [raw] }) });
  await s.login();
  const first = await (await s.request('/me')).json();
  assert.equal((await s.request('/profile/settings', 'PUT', { timeZone: 'Mars/Olympus' })).status, 400);
  assert.equal((await s.request('/profile/settings', 'PUT', { timeZone: 'Europe/Berlin' })).status, 200);
  const changed = await (await s.request('/me')).json();
  assert.equal(changed.user.timeZone, 'Europe/Berlin'); assert.equal(changed.user.createdAt, first.user.createdAt);
  await s.request('/profile/check-games', 'POST', {});
  const path = '/profile/games/lichess%3AMock0001/collect';
  const saved = await (await s.request(path, 'POST', {})).json();
  assert.equal(saved.grant.timeZone, 'Europe/Berlin');
  assert.equal(saved.grant.events.find(event => event.badgeId === 'badge_played_monday').amount, 1);
  await s.request('/profile/settings', 'PUT', { timeZone: 'UTC' });
  assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, saved.grant.events);
  assert.equal((await s.request('/profile/settings', 'PUT', { timeZone: 'UTC' }, '')).status, 401);
  s.db.close();
});

test('both platforms collect Mirror Dimension from actual imported castling once', async () => {
  const moves = readFileSync(new URL('../../web/src/fixtures/games/opposite-castling.pgn', import.meta.url), 'utf8').trim().split('\n\n')[1].replace('1-0', '0-1');
  const lichess = sample('lichess', { id: 'Cast0001' });
  const chesscom = sample('chesscom', { id: '999031', name: 'testchess' });
  for (const raw of [lichess, chesscom]) raw.pgn = raw.pgn.replace('1. f3 e5 2. g4 Qh4# 0-1', moves);
  lichess.status = 'resign';
  const s = await setup({ fetcher: upstream({ lichess: [lichess], chesscom: [chesscom] }) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json(); assert.equal(me.games.length, 2);
  for (const game of me.games) {
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const response = await s.request(path, 'POST', { color: 'white', events: [{ kind: 'badge', badgeId: 'badge_opposite_side_casteling', amount: 9999 }] });
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    assert.equal(grant.color, 'black');
    assert.deepEqual(grant.events.filter(event => event.badgeId === 'badge_opposite_side_casteling'), [
      { kind: 'badge', badgeId: 'badge_opposite_side_casteling', amount: 1, ply: 18 },
    ]);
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
  }
  assert.equal((await (await s.request('/profile/collection')).json()).length, 2);
  s.db.close();
});

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
  checkpoint.results.forEach(result => { result.annotations = { quality: 'blunder', book: { status: 'book', ruleVersion: 'forged' } }; });
  assert.equal((await s.request(path, 'PUT', { checkpoint })).status, 200);
  const saved = await (await s.request(path)).json();
  assert.equal(saved.results.length, 4);
  assert.ok(saved.results.every(result => result.annotations.quality === 'clean'));
  assert.ok(saved.results.every(result => result.annotations.book.ruleVersion === 'book-move-v1'));
  assert.ok(saved.results.slice(0, 2).every(result => result.annotations.book.status === 'candidate'));
  const nextApp = await createApp(s.options);
  const restored = await nextApp.request(`${baseURL}/api${path}`, { headers: { Cookie: cookie } });
  assert.deepEqual((await restored.json()).results, saved.results);
  const expanded = structuredClone(checkpoint);
  expanded.results[0].topMoves = ['f2f3', 'e2e4', 'd2d4'].map((uci, i) => ({ uci, depth: 6, score: { type: 'cp', value: i ? -55 * i : 0 } }));
  expanded.results[1].topMoves = ['e7e5', 'c7c5', 'e7e6'].map((uci, i) => ({ uci, depth: 6, score: { type: 'cp', value: 55 * i } }));
  assert.equal((await s.request(path, 'PUT', { checkpoint: expanded })).status, 200);
  const enriched = await (await s.request(path)).json();
  assert.ok(enriched.results.slice(0, 2).every(result => result.annotations.best && result.annotations.only));
  assert.deepEqual(enriched.results[0].topMoves, expanded.results[0].topMoves);
  // A stale browser cannot replace enriched analysis with the older shape.
  assert.equal((await s.request(path, 'PUT', { checkpoint })).status, 200);
  assert.deepEqual((await (await s.request(path)).json()).results, enriched.results);
  for (const picks of [
    expanded.results[0].topMoves.slice(0, 2),
    expanded.results[0].topMoves.map((pick, i) => i === 1 ? { ...pick, uci: 'e2e8' } : pick),
    expanded.results[0].topMoves.map((pick, i) => i === 1 ? { ...pick, uci: 'f2f3' } : pick),
    expanded.results[0].topMoves.map((pick, i) => i === 1 ? { ...pick, depth: 5 } : pick),
    expanded.results[0].topMoves.map((pick, i) => i === 0 ? { ...pick, score: { type: 'cp', value: 1 } } : pick),
  ]) {
    const invalid = structuredClone(expanded);
    invalid.results[0].topMoves = picks;
    assert.equal((await s.request(path, 'PUT', { checkpoint: invalid })).status, 400);
  }
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
  const response = await s.request(path, 'POST', { checkpoint, grade: 'D-', highGrades: 999, level: 10 }); assert.equal(response.status, 200);
  const award = (await response.json()).grant.events.find(event => event.kind === 'mastery');
  assert.equal(award.amount, 137); assert.equal(award.ply, 9);
  assert.equal(award.grade, 'S+'); assert.equal(award.evidence.gradeVersion, 'fork-grades-v1');
  const recollect = await (await s.request(path, 'POST', {})).json();
  assert.deepEqual(recollect.grant.events.find(event => event.kind === 'mastery'), award);
  s.db.close();
});
test('both platforms calculate mileage from API clocks despite conflicting PGN metadata and speed labels', async () => {
  const lichess = sample('lichess', { id: 'Speed001' });
  lichess.clock = { initial: 900, increment: 15, totalTime: 1500 }; // PGN deliberately still says 600+0.
  const chesscom = sample('chesscom', { id: '999002', name: 'testchess' });
  // PGN deliberately still says 600+0; API clock settings take precedence.
  chesscom.time_control = '300+5'; chesscom.time_class = 'blitz';
  const fastLichess = [15, 30].map((initial, i) => ({ ...sample('lichess', { id: `Fast000${i}` }), speed: 'bullet', clock: { initial, increment: 0, totalTime: initial } }));
  const fastChess = [15, 30].map((initial, i) => ({ ...sample('chesscom', { id: String(999010 + i), name: 'testchess' }), time_class: 'bullet', time_control: `${initial}+0` }));
  const s = await setup({ fetcher: upstream({ lichess: [lichess, ...fastLichess], chesscom: [chesscom, ...fastChess] }) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json();
  assert.equal(me.games.length, 6);
  for (const game of me.games) {
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const response = await s.request(path, 'POST', { timeControl: '3600+0', speed: 'classical' });
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    const expected = { '15+0': 'badge_played_ultrabullet', '30+0': 'badge_played_hyperbullet', '900+15': 'badge_played_classical', '300+5': 'badge_played_rapid' }[game.timeControl];
    assert.ok(expected); assert.equal(grant.timeControl, game.timeControl);
    assert.deepEqual(grant.events.filter(event => event.kind === 'badge' && /^badge_played_(ultrabullet|hyperbullet|bullet|blitz|rapid|classical)$/.test(event.badgeId)), [
      { kind: 'badge', badgeId: expected, amount: 1, ply: 4 },
    ]);
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
  }
  s.db.close();
});

test('rating badges use pre-game API ratings, ignore forged inputs, and skip provisional or missing evidence', async () => {
  const cases = [
    ['lichess', 'Odds0001', 1800, 1700, false, '0-1', 'badge_upset'],
    ['chesscom', '999021', 1800, 1700, false, '0-1', 'badge_upset'],
    ['lichess', 'Odds0002', 1850, 1700, false, '1/2-1/2', 'hold_your_own'],
    ['chesscom', '999022', 1850, 1700, false, '1/2-1/2', 'hold_your_own'],
    ['lichess', 'Odds0003', 2000, 1700, true, '0-1', undefined],
    ['chesscom', '999023', 2000, undefined, false, '0-1', undefined],
  ];
  const records = cases.map(([platform, id, opponent, player, provisional, result]) => {
    const raw = sample(platform, { id, name: platform === 'lichess' ? 'noctu2nality' : 'testchess' });
    const players = platform === 'lichess' ? raw.players : raw;
    players.white.rating = opponent; players.black.rating = player; players.black.provisional = provisional;
    // These deliberately contradict the API; they must not determine rewards.
    raw.pgn = player === undefined ? `[WhiteElo "2900"]\n[BlackElo "900"]\n${raw.pgn}`
      : `[WhiteElo "900"]\n[BlackElo "2900"]\n${raw.pgn}`;
    if (result === '1/2-1/2') {
      raw.pgn = raw.pgn.replaceAll('0-1', result).replace('1. f3 e5 2. g4 Qh4#', '1. e4 e5');
      if (platform === 'lichess') raw.status = 'draw';
    }
    return raw;
  });
  const s = await setup({ fetcher: upstream({ lichess: records.filter(raw => raw.players), chesscom: records.filter(raw => !raw.players) }) });
  await s.login(); await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json(); assert.equal(me.games.length, cases.length);
  for (const imported of me.games) {
    const expected = cases.find(item => item[0] === imported.platform && imported.sourceId.endsWith(item[1]))[6];
    const path = `/profile/games/${encodeURIComponent(imported.id)}/collect`;
    const response = await s.request(path, 'POST', { ratings: { white: { value: 9999 }, black: { value: 1 } } });
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    const events = grant.events.filter(event => ['badge_upset', 'hold_your_own'].includes(event.badgeId));
    assert.deepEqual(events.map(event => event.badgeId), expected ? [expected] : []);
    if (expected) { assert.equal(events[0].amount, 1); assert.equal(events[0].ply, expected === 'badge_upset' ? 4 : 2); }
    assert.deepEqual(grant.ratings, imported.ratings);
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
  }
  // Earlier imports have no normalized ratings, but retain their original API
  // payload, including missing/provisional evidence. Recover that evidence too.
  for (const row of s.db.prepare('SELECT * FROM imported_games').all()) {
    const old = JSON.parse(row.game_json); delete old.ratings;
    s.db.prepare('UPDATE imported_games SET game_json=? WHERE user_id=? AND game_id=?').run(JSON.stringify(old), row.user_id, row.game_id);
  }
  const restored = await (await s.request('/me')).json();
  assert.deepEqual(restored.games.map(game => game.ratings), me.games.map(game => game.ratings));
  for (const imported of restored.games) {
    const expected = cases.find(item => item[0] === imported.platform && imported.sourceId.endsWith(item[1]))[6];
    const grant = (await (await s.request(`/profile/games/${encodeURIComponent(imported.id)}/collect`, 'POST', {})).json()).grant;
    assert.deepEqual(grant.events.filter(event => ['badge_upset', 'hold_your_own'].includes(event.badgeId)).map(event => event.badgeId), expected ? [expected] : []);
  }
  s.db.close();
});

test('both imported platforms collect an analyzed repetition recovery once and preserve it without the cache', async () => {
  const records=[sample('lichess'),sample('chesscom',{name:'testchess'})];
  for(const raw of records){
    raw.pgn=raw.pgn.replaceAll('0-1','1/2-1/2').replace('1. f3 e5 2. g4 Qh4#','1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
    if(raw.status)raw.status='draw';else{raw.white.result='repetition';raw.black.result='repetition';}
  }
  const s=await setup({fetcher:upstream({lichess:[records[0]],chesscom:[records[1]]})});
  await s.login();await s.request('/profile/accounts','POST',{platform:'chesscom',username:'testchess'});await s.request('/profile/check-games','POST',{});
  const me=await(await s.request('/me')).json();assert.equal(me.games.length,2);
  for(const game of me.games){
    const path=`/profile/games/${encodeURIComponent(game.id)}/collect`;
    let grant=(await(await s.request(path,'POST',{})).json()).grant;assert.ok(!grant.events.some(e=>e.badgeId==='badge_draw_lost_threefold'));
    const checkpoint={pgn:game.pgn,version:'stockfish-19.0.1-full-single-depth6-hash32-proof-v1',virtual:[],virtualStatus:'pending',
      results:['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1','f6g8'].map((bestMove,i)=>({ply:i+1,bestMove,ms:1,best:{type:'cp',value:300},played:{type:'cp',value:0}}))};
    grant=(await(await s.request(path,'POST',{checkpoint,drawReason:'agreement',events:[]})).json()).grant;
    assert.equal(grant.drawReason,'repetition');assert.equal(grant.events.filter(e=>e.badgeId==='badge_draw_lost_threefold').length,1);
    s.db.prepare('DELETE FROM analyses').run();
    assert.deepEqual((await(await s.request(path,'POST',{})).json()).grant.events,grant.events);
  }
  s.db.close();
});

test('both providers collect scoped skewer grades and keep fork balances and retries independent', async () => {
  const white = sample('lichess', { id: 'Skew0001' });
  white.pgn = white.pgn.replace('[White "Opponent"]', '[White "noctu2nality"]').replace('[Black "noctu2nality"]', '[Black "Opponent"]')
    .replaceAll('0-1', '1/2-1/2').replace('\n\n', '\n[SetUp "1"]\n[FEN "8/8/8/4r3/3k4/8/8/2B4K w - - 0 1"]\n\n').replace('1. f3 e5 2. g4 Qh4#', '1. Bb2+');
  white.players = {white:{user:{id:'noctu2nality',name:'noctu2nality'}},black:{user:{id:'opponent',name:'Opponent'}}}; white.status='draw';
  const black = sample('chesscom', {id:'999081',name:'testchess'});
  black.pgn = black.pgn.replace('\n\n', '\n[SetUp "1"]\n[FEN "6kr/8/8/8/Q3K3/8/8/8 b - - 0 1"]\n\n').replace('1. f3 e5 2. g4 Qh4#', '1... Rh4+');
  const s=await setup({fetcher:upstream({lichess:[white],chesscom:[black]})});
  await s.login();await s.request('/profile/accounts','POST',{platform:'chesscom',username:'testchess'});await s.request('/profile/check-games','POST',{});
  const me=await(await s.request('/me')).json();assert.equal(me.games.length,2);
  for(const game of me.games){
    const path=`/profile/games/${encodeURIComponent(game.id)}/collect`;
    const checkpoint={pgn:game.pgn,version:'stockfish-19.0.1-full-single-depth6-hash32-proof-v1',virtual:[],virtualStatus:'pending',results:[{ply:1,bestMove:game.color==='white'?'c1b2':'h8h4',ms:1,best:{type:'cp',value:0},played:{type:'cp',value:0}}]};
    const response=await s.request(path,'POST',{checkpoint,masteryId:'mastery_knight_forks',amount:99999});assert.equal(response.status,200);
    const grant=(await response.json()).grant;const awards=grant.events.filter(e=>e.kind==='mastery');
    assert.equal(awards.length,1);assert.equal(awards[0].masteryId,'mastery_skewers');assert.equal(awards[0].grade,'S+');assert.equal(awards[0].amount,137);
    assert.deepEqual((await(await s.request(path,'POST',{})).json()).grant.events,grant.events);
  }
  s.db.close();
});

test('both providers derive one pawn endgame award from the selected side and preserve it without analysis', async () => {
  const source = readFileSync(new URL('../../web/src/fixtures/games/pawn-vs-pawn.pgn', import.meta.url), 'utf8');
  const moves = source.trim().split('\n\n')[1];
  const fen = source.match(/\[FEN "([^"]+)"\]/)[1];
  const lichess = sample('lichess', { id: 'Pawn0001' });
  const chesscom = sample('chesscom', { id: '999091', name: 'testchess' });
  for (const raw of [lichess, chesscom]) raw.pgn = raw.pgn.replaceAll('0-1', '1-0')
    .replace('\n\n', `\n[SetUp "1"]\n[FEN "${fen}"]\n\n`)
    .replace('1. f3 e5 2. g4 Qh4# 1-0', moves);
  chesscom.white.result = 'win'; chesscom.black.result = 'checkmated';
  const s = await setup({ fetcher: upstream({ lichess: [lichess], chesscom: [chesscom] }) });
  await s.login();
  await s.request('/profile/accounts', 'POST', { platform: 'chesscom', username: 'testchess' });
  await s.request('/profile/check-games', 'POST', {});
  const me = await (await s.request('/me')).json();
  assert.equal(me.games.length, 2);
  for (const game of me.games) {
    const parsed = parsePgn(game.pgn)[0];
    const pos = startingPosition(parsed.headers).unwrap();
    const results = [];
    for (const node of parsed.moves.mainline()) {
      const move = parseSan(pos, node.san);
      results.push({ ply: results.length + 1, bestMove: makeUci(move), best: { type: 'cp', value: 0 }, played: { type: 'cp', value: 0 }, ms: 1 });
      pos.play(move);
    }
    const path = `/profile/games/${encodeURIComponent(game.id)}/collect`;
    const checkpoint = { pgn: game.pgn, version: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1', results, virtual: [], virtualStatus: 'terminal' };
    const response = await s.request(path, 'POST', { checkpoint, grade: 'S+', amount: 99999 });
    assert.equal(response.status, 200);
    const grant = (await response.json()).grant;
    const awards = grant.events.filter(e => e.kind === 'mastery' && e.family === 'endgame');
    assert.equal(awards.length, 1);
    assert.equal(awards[0].masteryId, 'mastery_pawn_vs_pawn');
    assert.equal(awards[0].evidence.startPly, 0);
    assert.equal(awards[0].evidence.result, 'loss');
    assert.equal(awards[0].grade, 'D-');
    s.db.prepare('DELETE FROM analyses').run();
    assert.deepEqual((await (await s.request(path, 'POST', {})).json()).grant.events, grant.events);
    assert.equal((await (await s.request('/profile/collection')).json()).find(g => g.id === game.id).events.filter(e => e.family === 'endgame').length, 1);
  }
  s.db.close();
});

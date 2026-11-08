import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApp } from '../dist/app.js';
import { openDatabase } from '../dist/database.js';
import { sample, upstream } from './fixtures.mjs';

// Only the test process supplies upstream fixtures and reset controls. Neither
// endpoint overrides nor database resets exist in the application server.
const db = openDatabase(':memory:');
const options = { db, baseURL: 'http://127.0.0.1:4173', development: true,
  mockLogin: true, mockAgeHours: 8, mockUsername: 'noctu2nality',
  fetcher: input => {
    const now = Date.now();
    // Deliberately disagree with the PGN's rapid event and 600+0 tag: imports
    // must calculate rewards and replay totals from these API clock settings.
    const lichess = { ...sample('lichess', { now }), speed: 'bullet', clock: { initial: 30, increment: 0, totalTime: 30 } };
    const chesscom = { ...sample('chesscom', { now, name: 'testchess' }), time_class: 'bullet', time_control: '15+0' };
    return upstream({ now, lichess: [lichess], chesscom: [chesscom] })(input);
  },
};
let application = await createApp(options);
const app = new Hono();
app.post('/api/__test/reset', async c => {
  db.exec('DELETE FROM mock_sessions; DELETE FROM linked_accounts; DELETE FROM imported_games; DELETE FROM collections; DELETE FROM analyses; DELETE FROM profiles;');
  application = await createApp(options);
  return c.json({ ok: true });
});
app.all('*', c => application.fetch(c.req.raw));
serve({ fetch: app.fetch, port: 8788, hostname: '127.0.0.1' });

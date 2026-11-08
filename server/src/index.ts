import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createApp } from './app';
import { openDatabase } from './database';

const root = resolve(import.meta.dirname, '../..');
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const development = process.env.NODE_ENV === 'development';
const directory = resolve(process.env.SCRAPBOOK_DATA_DIR ?? resolve(root, '.local'));
mkdirSync(directory, { recursive: true });
const port = Number(process.env.SCRAPBOOK_API_PORT ?? 8787);
const app = await createApp({ db: openDatabase(resolve(directory, 'scrapbook.sqlite')),
  baseURL: process.env.SCRAPBOOK_APP_URL ?? 'http://127.0.0.1:5173', development,
  mockLogin: process.env.SCRAPBOOK_MOCK_LOGIN === '1',
  mockUsername: process.env.SCRAPBOOK_MOCK_LICHESS_USERNAME ?? 'noctu2nality',
  mockAgeHours: Number(process.env.SCRAPBOOK_MOCK_PROFILE_AGE_HOURS ?? 8),
  allowMultipleAccounts: process.env.SCRAPBOOK_ALLOW_MULTIPLE_ACCOUNTS === '1',
});
app.use('*', serveStatic({ root: resolve(root, 'web/dist') }));
app.get('*', serveStatic({ path: resolve(root, 'web/dist/index.html') }));
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`Scrapbook API: http://127.0.0.1:${port}`));

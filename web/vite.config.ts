import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: { proxy: { '/api': process.env.SCRAPBOOK_API_URL ?? 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': process.env.SCRAPBOOK_API_URL ?? 'http://127.0.0.1:8787' } },
  plugins: [react(), tailwindcss(), {
    name: 'polyglot-book',
    load(id) {
      if (id.endsWith('.bin?base64')) return `export default ${JSON.stringify(readFileSync(id.slice(0, -7)).toString('base64'))}`;
    },
  }],
  test: { include: ['src/**/*.test.ts'] },
});

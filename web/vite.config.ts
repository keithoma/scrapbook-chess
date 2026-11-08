import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: { proxy: { '/api': process.env.SCRAPBOOK_API_URL ?? 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': process.env.SCRAPBOOK_API_URL ?? 'http://127.0.0.1:8787' } },
  plugins: [react(), tailwindcss()],
  test: { include: ['src/**/*.test.ts'] },
});

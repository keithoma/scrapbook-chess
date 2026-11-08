import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
export const options = {
  entryPoints: ['src/index.ts', 'src/app.ts', 'src/platforms.ts', 'src/database.ts'], outdir: 'dist',
  platform: 'node', target: 'node22', format: 'esm', bundle: true, packages: 'external', sourcemap: true,
  plugins: [{ name: 'authored-content', setup(api) {
    api.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'authored-content' }));
    api.onLoad({ filter: /.*/, namespace: 'authored-content' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path), watchFiles: [args.path] }));
  } }],
};
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await build(options);

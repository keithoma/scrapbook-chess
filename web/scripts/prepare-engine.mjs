import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const source = dirname(require.resolve('stockfish/package.json'));
const target = join(root, 'public/engine');
await mkdir(target, { recursive: true });
const files = ['stockfish-19-single.js', 'stockfish-19-single.wasm'];
for (const file of files) {
  const from = join(source, 'bin', file);
  const to = join(target, file);
  const original = await stat(from);
  const existing = await stat(to).catch(() => null);
  if (existing?.size !== original.size) await copyFile(from, to);
}
await copyFile(join(source, 'Copying.txt'), join(target, 'COPYING.txt'));
await writeFile(join(target, 'source.json'), JSON.stringify({
  package: 'stockfish', version: JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version,
  source: 'https://github.com/nmrugg/stockfish.js/tree/v19.0.1', files,
}, null, 2));
console.log('Full single-threaded Stockfish prepared locally. No lite engine.');

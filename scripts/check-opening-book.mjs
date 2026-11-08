import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../data/openings/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('book.json', root), 'utf8'));
const bytes = await readFile(new URL(manifest.file, root));
assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
assert.equal(bytes.length % 16, 0);
let previous = 0n;
for (let offset = 0; offset < bytes.length; offset += 16) {
  const key = bytes.readBigUInt64BE(offset);
  assert.ok(key >= previous, 'Polyglot entries must be sorted');
  previous = key;
}
console.log(`Verified ${manifest.id}: ${bytes.length / 16} Polyglot entries.`);

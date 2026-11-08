import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocumentation, MAX_DOCUMENT_BYTES } from './check-docs.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'scrapbook-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'));
  await mkdir(join(root, 'design'));
  return root;
}

test('accepts the exact byte boundary and rejects oversized UTF-8 pages in either tree', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs/page.md'), 'x'.repeat(MAX_DOCUMENT_BYTES));
  assert.deepEqual((await checkDocumentation(root)).errors, []);
  await writeFile(join(root, 'design/page.md'), 'é'.repeat(MAX_DOCUMENT_BYTES / 2) + 'x');
  const result = await checkDocumentation(root);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /design[/\\]page.md: 20001 bytes/);
});

test('checks moved links and entry documents while skipping code examples and external URLs', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs/target name.md'), '# Target\n');
  await writeFile(join(root, 'docs/index.md'), [
    '[target](target%20name.md#heading)', '[target](<target name.md>)',
    '[external](https://example.com/missing.md)', '`[example](missing.md)`',
    '```md\n[example](missing.md)\n```', '[missing](old-location.md)',
  ].join('\n'));
  await writeFile(join(root, 'README.md'), '[missing](docs/old-index.md)');
  const result = await checkDocumentation(root);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(error => error.includes('old-location.md')));
  assert.ok(result.errors.some(error => error.includes('old-index.md')));
});

test('does not scan arbitrary root scratch documents or follow links outside the repository', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'private-scratch.md'), '[missing](absent.md)');
  await writeFile(join(root, 'design/rules.md'), '[outside](../../outside.md)');
  const result = await checkDocumentation(root);
  assert.equal(result.documents, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /escapes the repository/);
});

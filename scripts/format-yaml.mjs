import { readdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { format } from 'prettier';
import { parseDocument, visit } from 'yaml';

const check = process.argv.includes('--check');
const files = ['pnpm-workspace.yaml'];
async function discover(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await discover(path);
    else if (/\.ya?ml$/.test(entry.name)) files.push(path);
  }
}
await discover('data');
let changed = 0;
const ids = new Set();
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error(`${file}: ${doc.errors.join('\n')}`);
  const before = doc.toJS();
  if (file.startsWith('data/achievements/')) for (const entry of Array.isArray(before) ? before : [before]) {
    assert.ok(entry.id && !ids.has(entry.id), `${file}: missing or duplicate achievement ID`);
    ids.add(entry.id);
    assert.ok(typeof entry.category === 'string' && entry.category.trim()
      && typeof entry.subcategory === 'string' && entry.subcategory.trim(), `${file}: every achievement needs a category and subcategory`);
    const family = { badge: 'badges', mastery: 'masteries' }[entry.type];
    assert.ok(family, `${file}: unsupported achievement family`);
    assert.equal(file, `data/achievements/${family}/${slug(entry.category)}/${slug(entry.subcategory)}.yml`, `${file}: folder and filename must match the category and subcategory`);
  }
  if (file.startsWith('data/achievements/')) visit(doc, {
    Map(_key, map) {
      const fields = map.has('id')
        ? ['id', 'type', 'category', 'subcategory', 'name', 'description', 'rule_version', 'compliance_filters', 'flavor', 'flavor_text', 'config', 'quality_awards', 'level_thresholds']
        : map.has('name') && map.has('amount') ? ['name', 'amount', 'flavor', 'flavor_text']
        : map.has('tiers') ? ['metric_key', 'required_value', 'is_hidden', 'analysis_required', 'max_seconds', 'survival_plies', 'lost_cp', 'retention_chance_slack', 'tiers']
        : map.has('text') || map.has('quote') || map.has('player_quote') ? ['text', 'quote', 'player_quote', 'author'] : [];
      if (!fields.length) return;
      const rank = key => { const index = fields.indexOf(String(key)); return index < 0 ? fields.length : index; };
      map.items.sort((a, b) => rank(a.key) - rank(b.key));
    },
  });
  // Keep sequences and comments attached to their authored nodes. Only mapping
  // presentation and whitespace change; reject any change to parsed values.
  const output = await format(doc.toString({ lineWidth: 0 }), { parser: 'yaml', tabWidth: 2, singleQuote: true, printWidth: 100 });
  const formatted = parseDocument(output);
  assert.deepEqual(formatted.errors, [], `${file}: formatter produced invalid YAML`);
  assert.deepEqual(formatted.toJS(), before, `${file}: formatting changed content`);
  if (output !== source) {
    changed++;
    console.log(`${check ? 'Needs formatting' : 'Formatted'}: ${file}`);
    if (!check) await writeFile(file, output);
  }
}
console.log(`Checked ${files.length} source YAML files; ${changed} ${check ? 'need formatting' : 'updated'}. Generated lockfiles are excluded.`);
if (check && changed) process.exitCode = 1;

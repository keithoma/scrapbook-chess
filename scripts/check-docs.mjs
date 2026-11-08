import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_DOCUMENT_BYTES = 20_000;
const entryDocuments = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'web/README.md', 'scripts/README.md'];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(path);
  }
  return files;
}

function inlineTargets(markdown) {
  // Ignore examples in code fences/inline code. Heading fragments are not checked.
  const prose = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)]
    .map(match => match[1] ?? match[2]);
}

export async function checkDocumentation(root) {
  root = resolve(root);
  const bounded = (await Promise.all(['docs', 'design'].map(dir => markdownFiles(resolve(root, dir))))).flat();
  const entries = [];
  for (const path of entryDocuments) {
    const absolute = resolve(root, path);
    const exists = await stat(absolute).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (exists?.isFile()) entries.push(absolute);
  }
  const errors = [];
  let links = 0;
  let largest = { path: '', bytes: 0 };
  for (const file of [...bounded, ...entries]) {
    const data = await readFile(file);
    const label = relative(root, file);
    if (bounded.includes(file)) {
      if (data.byteLength > MAX_DOCUMENT_BYTES) {
        errors.push(`${label}: ${data.byteLength} bytes exceeds ${MAX_DOCUMENT_BYTES}; split it by topic.`);
      }
      if (data.byteLength > largest.bytes) largest = { path: label, bytes: data.byteLength };
    }
    for (const target of inlineTargets(data.toString('utf8'))) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
      let path;
      try { path = decodeURIComponent(target.split(/[?#]/)[0]); }
      catch { errors.push(`${label}: invalid encoded link ${target}`); continue; }
      if (!path) continue;
      const absolute = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(dirname(file), path);
      const fromRoot = relative(root, absolute);
      if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
        errors.push(`${label}: link escapes the repository: ${target}`);
        continue;
      }
      links++;
      try { await stat(absolute); }
      catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') errors.push(`${label}: broken local link ${target}`);
        else throw error;
      }
    }
  }
  return { errors, documents: bounded.length, links, largest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await checkDocumentation(root);
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${result.documents} docs/design documents and ${result.links} local links.`);
    console.log(`Largest: ${result.largest.path} (${result.largest.bytes}/${MAX_DOCUMENT_BYTES} bytes).`);
  }
}

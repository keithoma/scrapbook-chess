import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const revision = 'ea90849364d6b8063a77cccedf762a6c04f9d593';
const source = `https://raw.githubusercontent.com/lichess-org/lila/${revision}/public/piece/cburnett`;
const licenseSource = 'https://raw.githubusercontent.com/spdx/license-list-data/31846481de7ea17d92f2f46fad76abe58b2e9bb0/text/GPL-2.0-or-later.txt';
const target = fileURLToPath(new URL('../public/pieces/cburnett/', import.meta.url));
const files = {
  'bB.svg': '48ff9dba84dae861b1a81ac58f4647e05cee8a827acad1618bf11beaedcce60d',
  'bK.svg': '2dc3caba39a67a707ebc27f4e41b727dd5252f4f49da695fc15cc2589dd92a47',
  'bN.svg': '72e1565fbc9024015dcb6ee28d918c876523119f6f552c0a40d3118c13a67e13',
  'bP.svg': '93e11e46deceff0768211a28df3e39c6d3427aa172bdb5e3928b025bd2858587',
  'bQ.svg': '2d0162d1fe776ac5a4d307d4f6e5960804273edc0d3743f1c97a158f5a64c4b1',
  'bR.svg': '5928b86919ae815f5d35dea8a25f5a84c3f8839468a137e429d42f618185cbcd',
  'wB.svg': '8bf4f38cc170686775f81158934301942b07e3f1162e76c6305e76d66aaa0910',
  'wK.svg': '09837f1f99dae2d05c2a0bfb5ce0fb9f37a95b124de44f428a08ae18d7b7c557',
  'wN.svg': '43d8bed9cd40836335072a20f52d30237e6e2cbe304ffb13e258fa1d576c156a',
  'wP.svg': 'a8bd79f344ea69a577cdd7b11cbab7bbebfc157cce01c6d29b8f2edf1c44068e',
  'wQ.svg': '9c0a960b360e08cea48eedab54e852107145de289b81a82fe27942045e2ab665',
  'wR.svg': '05746153e11de3ff4a43d6725f704e226e5d5b49c6ff170ed598d3e9883f2cd5',
  'GPL-2.0.txt': 'aaf135472f81c5b4a0dca9367e5bb5e9750032b5bebe5442b36e4c0a47430df3',
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

await mkdir(target, { recursive: true });
await Promise.all(Object.entries(files).map(async ([name, expected]) => {
  const path = join(target, name);
  const cached = await readFile(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (cached && digest(cached) === expected) return;
  const url = name === 'GPL-2.0.txt' ? licenseSource : `${source}/${name}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== expected) throw new Error('SHA-256 mismatch');
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } catch (cause) {
    throw new Error(`Could not prepare chess piece asset ${name}. Check your connection and run pnpm prepare:pieces again.`, { cause });
  }
}));
await writeFile(join(target, 'NOTICE.txt'), `Chess pieces by Colin M.L. Burnett (cburnett).

The 12 SVG files in /pieces/cburnett/ are distributed unmodified under the
GNU General Public License, version 2 or (at your option) any later version.
The complete license is served at /pieces/cburnett/GPL-2.0.txt.
The SVG files themselves are the editable source for these assets.

Source revision: ${revision}
Source directory:
https://github.com/lichess-org/lila/tree/${revision}/public/piece/cburnett
Upstream attribution and license (public/piece/cburnett exception):
https://github.com/lichess-org/lila/blob/${revision}/COPYING.md
Author:
https://en.wikipedia.org/wiki/User:Cburnett
`);
console.log('Classic SVG chess pieces prepared locally (verified cache reused when available).');

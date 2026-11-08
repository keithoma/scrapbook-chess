# Browser proof configuration and storage

This reference describes the local browser app. See the
[tutorial](../tutorials/local-development.md) for setup and the
[analysis explanation](../explanation/browser-analysis.md) for its data flow.

## Configuration sources

| Concern | Authoritative source |
| --- | --- |
| Dependencies, scripts, and pinned engine package | [web/package.json](../../web/package.json) and its lockfile |
| Analysis depth and checkpoint version | [storage.ts](../../web/src/storage.ts) |
| Hash size, UCI commands, and worker lifecycle | [stockfish.ts](../../web/src/stockfish.ts) |
| Virtual continuation limit | [analysis.ts](../../web/src/analysis.ts) |
| Engine preparation and source/license metadata | [prepare-engine.mjs](../../web/scripts/prepare-engine.mjs) |
| Asset caching | [engine-cache.js](../../web/public/engine-cache.js) |
| Browser-test server and device settings | [playwright.config.ts](../../web/playwright.config.ts) |

The full single-threaded engine is approximately 94.6 MiB. The
[verification record](../qa/browser-proof.md) records the exact tested artifact.
The development and build scripts copy it from the dependency into ignored
`web/public/engine/`. The browser receives its license at `/engine/COPYING.txt`
and source metadata at `/engine/source.json`.

## Storage and offline behavior

Completed move results and virtual plies are saved in IndexedDB, keyed by the
PGN and engine/settings version. They belong to this browser and origin. Clearing
site data or browser eviction can remove them. JSON export preserves a copy
outside browser storage; there is no import/restore interface for that export yet.

A service worker caches the pinned engine assets. An already-open app can reuse
them for another analysis without a network connection. The app shell is not
cached for offline reload. Updating the engine requires updating the relevant
version/cache identifiers; there is no automated migration of old checkpoints.

The app requires a secure origin for Web Crypto and service-worker support.
Localhost qualifies. A plain HTTP LAN URL on a phone does not provide the same
APIs; use HTTPS when testing a physical device.

## Scope and limits

The app accepts one standard-chess PGN and replays its main line. It has no
platform imports, accounts, achievement awards, or server persistence. It does
not enforce rated-human eligibility on manually loaded fixtures.

The full engine asset exceeds Cloudflare's individual static-file limit. Hosted
delivery requires split packaging or separate asset storage. That packaging and
physical-device memory, battery, suspension, and Safari behavior remain unverified.

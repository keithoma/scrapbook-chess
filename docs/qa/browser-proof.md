# Browser analysis proof: verification record

Date: 2026-11-08.

This record predates the pnpm migration. Its command names describe the tested
run; use [the current check guide](../how-to/run-checks.md) for today’s commands.

## Outcome

The browser architecture works in the tested environment. A full, single-threaded
Stockfish WASM build analyzes the author's original rapid game, keeps replay
interactive, saves completed moves, and resumes after reload. No Python engine or
server-side analysis is involved.

Implementation: [local browser tutorial](../tutorials/local-development.md). The Python prototype and achievement
content are intact. This is a local proof, not a deployed app or achievement release.

## Environment and measurements

- Stockfish npm package 19.0.1; full single-threaded build, not lite.
- Depth 6, one worker, 32 MiB hash. Same settings for desktop and mobile viewport.
- Actual WASM file: 99,169,054 bytes (94.575 MiB), plus a small JS loader.
- Host: Intel Core i5-10210U @ 1.60 GHz, eight logical CPUs reported.
- Installed Google Chrome 141.0.7390.107, driven by Playwright.
- Source game: `mKunkW9L`, 137 plies, recovered from Git `8637c38`'s original
  Stockfish experiment; names `sa6561` / `noctu2nality`.

| Run | Summed move-search time | Results saved | Virtual continuation |
| --- | ---: | ---: | --- |
| Desktop Chrome, initial run | 1.60 s | 137 unique plies | 20 plies, no checkmate |
| Mobile viewport, initial unthrottled run | 1.80 s | 137 unique plies | 20 plies, no checkmate |
| Desktop Chrome, final targeted run | 3.17 s | 137 unique plies | 20 plies, no checkmate |
| Mobile viewport, final run with Chrome 4× CPU throttling | 6.89 s | 137 unique plies | 20 plies, no checkmate |

These are observations, not a controlled performance benchmark. Search time sums
the best-move search and a forced played-move search when needed. It excludes
engine download/startup, IndexedDB writes, UI work, and virtual playout. Pause and
reload occur during the tests. Hardware load and engine hash state can affect
timing and shallow-search results. Mobile emulation runs on the same desktop
CPU; it is not a measurement of a real phone.

The timings support using shallow browser analysis for the initial experience.
They do not establish Elo, tactical accuracy, or detector correctness.

## Checks performed

- `npm test`: four unit tests passed, covering legal replay of the entire game,
  castling's chessops-to-standard-UCI boundary, en passant, underpromotion,
  checkmate, illegal moves, and score normalization.
- `npm run build`: TypeScript checking and the production Vite/Tailwind build.
- `npm run test:browser`: four real Chrome tests passed across desktop and Pixel 7
  touch/viewport emulation.
- After strengthening the active-analysis interaction assertion and adding CPU
  throttling, reran the two long browser tests: both passed.
- Paused partway through the 137-ply game, reloaded, restored saved progress,
  resumed, and finished with exactly 137 unique move results.
- Navigated the board while the engine was actively analyzing.
- Verified the original final FEN and original move count remained unchanged
  after simulation, with no more than 20 virtual plies stored separately.
- Verified the engine WASM is cached. A different game's analysis subsequently
  completed with the browser network disabled, using the already-open app.
- The synthetic `1. f3 e5 2. g4` fixture produced `Qh4#` for Black in one virtual
  ply. An actual `Qh4#` game was terminal and received no extra continuation.
- Illegal move input showed an error without replacing the loaded game.
- Desktop/mobile screenshots inspected; no horizontal page overflow. Screenshots
  and test artifacts are generated under ignored `web/test-results/`.

## Architecture decisions confirmed by the proof

- Use chessops for legal replay/board operations, and Stockfish inside a dedicated
  browser Web Worker for evaluation and simulated continuations.
- Keep simulation separate from the actual game. This proof does not grant scraps
  or search alternative finishes to prefer uncollected scraps; those are later work.
- Keep completed work in IndexedDB, keyed by PGN and engine/settings version.
- Cache the pinned engine with a narrowly scoped service-worker fetch handler;
  do not cache stale application code during development.
- Full single-threaded Stockfish is a viable starting build on this desktop.
  Physical-device validation is still required before calling it the universal
  mobile default.

## Remaining checks and implementation work

- Real Android/iPhone memory pressure, browser suspension, heat, battery, and
  Safari/WebKit compatibility. Desktop Chrome emulation cannot establish these.
- The app must be served from a secure origin for IndexedDB key hashing and the
  service worker. A phone visiting a plain HTTP LAN address is not equivalent to
  localhost; use HTTPS for physical-device testing.
- Large download packaging: the full engine exceeds Cloudflare's 25 MiB per-file
  static limit. Split packaging or separate asset storage remains necessary.
- The engine cache supports reuse offline; the app shell is not a complete
  offline application and cannot currently reload offline.
- Browser storage can be evicted/cleared. Add server persistence and accounts for
  durable collections; local checkpoints are not cross-device synchronization.
- Add validated achievement events, real/virtual scrap state and counts, bounded
  alternative finishes, and the first playable reward loop next.
- This proof accepts one standard PGN and analyzes its main line. chessops' PGN
  parser is permissive; source-aware import validation belongs with the adapters.
- Import eligibility and rated-human restrictions are not applied to manually
  loaded proof fixtures. No production account restriction has been implemented.

No code was deleted and nothing was published.

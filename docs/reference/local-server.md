# Local profiles and import server

The local TypeScript server uses Node.js and SQLite. Its dependency versions and
runtime requirement are authoritative in [server/package.json](../../server/package.json)
and the [root package file](../../package.json). Proper authentication, ownership
verification, and a hosted deployment remain deferred. See the
[import guide](../how-to/import-games.md) for the user workflow.

## Configuration

The server reads the repository-root `.env`. Existing process environment values
take precedence. [The example file](../../.env.example) documents the default
local settings; [server startup](../../server/src/index.ts) defines runtime values.

| Setting | Purpose |
| --- | --- |
| `SCRAPBOOK_MOCK_LOGIN` | Enable the development-only mock login when set to `1`. |
| `SCRAPBOOK_MOCK_LICHESS_USERNAME` | Bind mock login to this Lichess account. |
| `SCRAPBOOK_MOCK_PROFILE_AGE_HOURS` | Backdate a newly created mock profile, not an existing one. |
| `SCRAPBOOK_ALLOW_MULTIPLE_ACCOUNTS` | Permit multiple linked accounts per platform during local testing. |
| `SCRAPBOOK_APP_URL` | Exact browser origin accepted for state-changing requests. |
| `SCRAPBOOK_DATA_DIR` | Override the default `.local/` data directory. |
| `SCRAPBOOK_API_PORT` | Override the API's default loopback port. |
| `SCRAPBOOK_API_URL` | Override Vite's proxy destination when running the browser app. |

`pnpm dev` starts both processes and stops them together. The API binds to
loopback. Vite uses a strict port so a silently changed browser origin cannot
break request validation. Production rejects enabled mock-login or multiple-account
flags and never accepts mock cookies. No production login is implemented yet.

## Storage and sessions

SQLite lives at `.local/scrapbook.sqlite` by default. The
[database module](../../server/src/database.ts) defines tables for profiles,
hashed mock session tokens, linked accounts, imported games and raw responses,
analysis checkpoints, and per-game contribution ledgers. Profile creation dates
come from the server. The mock age applies only when its profile is first inserted.

Mock sessions use opaque random tokens in HttpOnly, SameSite cookies. They are
local test identities, not an authentication system or proof of account ownership.
All profile records and API lookups are scoped to the session's profile ID.

Imported games are unique by profile and platform/game identity. Reward writes
use a transaction, compute contributions on the server, preserve collected evidence,
and replace one ledger row. Clients cannot set arbitrary balances or choose the
opponent's color. The server accepts browser-computed evaluations for this personal
prototype; it does not independently certify that Stockfish produced those scores.

The browser keeps engine assets and local checkpoints. Completed imported-game
analysis is also saved to the server, and collection saves its submitted evidence
atomically with rewards. Guest rewards remain in IndexedDB and are not migrated.

The database uses WAL journaling. Stop the development server before copying the
whole data directory for a simple backup. Browser site-data deletion does not
delete server records. Deleting the local database discards those records and
allows the next mock login to create a new profile date.

## HTTP and import interfaces

[Shared contracts](../../shared/contracts.ts) describe normalized games, links,
profiles, and import reports. [The API](../../server/src/app.ts) implements:

| Route | Behavior |
| --- | --- |
| `GET /api/me` | Return the session's profile, accounts, and game history. |
| `POST /api/mock-login`, `POST /api/logout` | Enter or leave the local test profile. |
| `POST /api/profile/accounts` | Add an unverified local-testing account. |
| `DELETE /api/profile/accounts/:id` | Stop importing this account. |
| `POST /api/profile/check-games` | Manually import games, with per-account results. |
| `GET /api/profile/collection` | Read saved profile contributions. |
| `GET/PUT /api/profile/games/:id/analysis` | Restore or save an imported game's analysis. |
| `POST /api/profile/games/:id/collect` | Recompute and save that game's rewards. |

State-changing requests require the configured browser Origin. Profile endpoints
require a mock session. Uploads are bounded and analysis evidence is validated
against the imported PGN. Reward calculation reuses the existing
[collection rules](../../web/src/achievements/collection.ts), including frozen
mastery and virtual-scrap evidence. The server build loads the same authored YAML.

## Platform behavior and limits

[Platform adapters](../../server/src/platforms.ts) serialize upstream requests,
identify the app, bound response/cache sizes, and use ETags when available.
Concurrent checks for one profile share a job. A short server cooldown limits
immediate repeated checks. A failure on one platform does not discard imports
from the other. Oversized or malformed responses fail visibly.

Lichess uses its [documented NDJSON game export](https://lichess.org/api#tag/Games/operation/apiGamesUser),
with a profile-date window, finished/rated filters, PGN, and clocks. Metadata
validation rejects AI players and BOT accounts. The raw response and PGN are kept.

Chess.com uses the [Published-Data API](https://www.chess.com/news/view/published-data-api).
It revisits all monthly archives from the profile's start month, including a
boundary month. Only expected archive URLs are accepted. Real-time game starts
come from UTC PGN tags; missing timestamps are not guessed. Rated games exclude
the platform's [always-unrated computer games](https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots),
and explicit bot markers are rejected. The API's cache can delay new games.

Mileage rewards use the [shared clock-based classification](browser-proof.md#mileage-and-time-controls)
for both platforms. Lichess imports require valid numeric API clock settings;
PGN tags do not substitute for missing clock settings. No automatic polling, correspondence imports, or public
account verification is implemented. Existing tests cover schema fixtures,
filters, delayed publication, concurrent saves, session isolation, and browser
restoration. Browser import tests use an isolated fixture server; live platform
availability is a separate check. No test reset or upstream-override HTTP endpoints
exist in the application server.

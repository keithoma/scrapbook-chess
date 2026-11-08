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
| Workspace package manager and Node runtime | [root package.json](../../package.json) and [pnpm workspace](../../pnpm-workspace.yaml) |
| English/German interface messages | [i18n.ts](../../web/src/i18n.ts) |
| Local badges and their YAML sources | [catalog.ts](../../web/src/achievements/catalog.ts) |
| Contribution extraction and exact scrap identity | [collection.ts](../../web/src/achievements/collection.ts) |
| Shared clock-based speed classification | [time-control.ts](../../web/src/time-control.ts) |
| Atomic per-game collection persistence | [ledger.ts](../../web/src/achievements/ledger.ts) |
| Bounded alternative virtual finishes | [virtual-finish.ts](../../web/src/virtual-finish.ts) |
| Knight-fork candidates and engine comparisons | [knight-forks.ts](../../web/src/tactics/knight-forks.ts) |
| Legal material-threat verification | [fork-material.ts](../../web/src/tactics/fork-material.ts) |
| Fork mastery quality awards and levels | [mastery YAML](../../data/achievements/masteries/tactics/forks.yml) and [mastery.ts](../../web/src/achievements/mastery.ts) |

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

Imported games opened from a mock profile also restore saved server analysis.
The [local server reference](local-server.md) describes profile persistence; the
rest of this section describes the browser cache and signed-out guest notebook.

A service worker caches the pinned engine assets. An already-open app can reuse
them for another analysis without a network connection. The app shell is not
cached for offline reload. Updating the engine requires updating the relevant
version/cache identifiers; there is no automated migration of old checkpoints.

The app requires a secure origin for Web Crypto and service-worker support.
Localhost qualifies. A plain HTTP LAN URL on a phone does not provide the same
APIs; use HTTPS when testing a physical device.

## Guest collection

Choose White or Black separately for each uploaded game, then select **Collect
rewards**. Collection requires a completed PGN result or board-proven checkmate.
The supplied recent-game example defaults to Black, as identified by its author;
this does not set the color for other uploaded games. Existing saved selections
and an explicit correction take precedence over that example's default.
The active badges use their original YAML definitions and thresholds. Badge
names, tier labels, and flavor remain the authored English text;
the surrounding interface is localized. Knight-fork mastery is implemented;
other mastery tracks and story remain future work. All 61 YAML badges are active.
See [badge qualification](badge-rules.md) for calendar, phase, clock, development,
and evaluation-based families.

### Active board-event badges

These badges use the selected player's actual game, without Stockfish analysis.
The [catalog](../../web/src/achievements/catalog.ts) links their authored sources.

| Badge | Progress |
| --- | --- |
| Obsession | One completed game. |
| Winner | One win at the final actual ply, from the PGN result; a board-proven checkmate takes precedence. Draws and losses give none. |
| Effort | One per actual player move. |
| Inquisitor | One per move giving check, including checkmate, discovered checks, and castling checks. Double check counts once. |
| Anti-antichess | Gross captured material: pawn 1, knight/bishop 3, rook 5, queen 9. Trades count; own losses are not subtracted. En passant captures a pawn. A captured promoted piece uses its current role. |
| Promotion Master | One per promotion, including underpromotions and capture-promotions. Promotion itself adds no captured material. |
| The French Move | One per en passant capture. |
| Mirror Dimension | One win in a game where both players actually castled, on opposite sides. |

Virtual continuations never contribute to these badges. The separate
[clean-material badges](badge-rules.md#clean-material-gains) have quality and
survival requirements that do not apply to Anti-antichess. Its queen-trade flavor
text remains a joke, not a capture rule.
Promotion Master retains its separate bronze/silver/gold tiers, starting at ten
promotions.

### Mirror Dimension

[Skill / Castling](../../data/achievements/badges/skill/castling.yml) preserves the
stable ID `badge_opposite_side_casteling`, its name, and its existing tier amounts.
It has base flavor and a separate flavor text for every tier.

Both players must make legal castling moves in the actual game: one kingside and
the other queenside, in either order. Later king moves do not erase that history.
The selected player must win, from the declared result or a board-proven mate.
Resignation and timeout wins qualify. Draws, losses, one-sided or same-side
castling, castling rights without played castles, and simulated moves do not.
King destinations and PGN comments do not establish that castling happened.

The badge contributes once at the final actual ply, after the result is known;
the second castling move alone does not award it. It needs no Stockfish analysis.
Guest and imported profile games use the same rule. Recollect an older game to
add the award without duplicating progress; correcting color replaces its credit.

To try it locally, load the [synthetic example PGN](../../web/src/fixtures/games/opposite-castling.pgn),
choose White, and collect its rewards. Both players have castled by ply 16; the
badge appears at the game-end contribution at ply 18.

### Rating badges

Both badges in [Resilience / Against the Odds](../../data/achievements/badges/resilience/against-the-odds.yml)
use the selected player's actual result and the ratings recorded before that
game. They need no Stockfish analysis and contribute once at the final actual ply.

| Badge | Qualifying result |
| --- | --- |
| Elo Is a Social Construct (`badge_upset`) | Win against an opponent rated at least 100 points higher. |
| Agree to Disagree (`hold_your_own`) | Draw against an opponent rated at least 150 points higher. |

Gaps are inclusive and compare the two players in the same game and platform.
Current profile ratings, rating changes after the game, and engine continuations
do not determine these awards. Missing, invalid, or explicitly provisional ratings
on either side give no rating-badge progress; other rewards remain collectible.
A board-proven mate takes precedence over a contradictory PGN result.

New profile imports preserve both ratings and explicit provisional flags from
the platform payload. Those values override conflicting PGN rating tags. Older
imports recover this evidence from their already-saved platform payload, including
missing or provisional ratings, without looking up current ratings. Guest
uploads use `WhiteElo` and `BlackElo`; a trailing `?` marks a provisional rating.
Unknown values are never treated as zero. Collected records retain the rating
evidence alongside the PGN. Recollect an older game to add its qualifying award
without duplicating progress.

### Mileage and time controls

Obsession counts every completed eligible game. The six active speed badges
each count one completed game at the final actual ply, regardless of its result.
Both platforms use the [Lichess time-control convention](https://lichess.org/faq#time-controls):
starting seconds plus 40 times the increment. The computed duration selects one
of the six authored categories, including hyperbullet. Original platform labels
remain in import history but do not determine mileage rewards.

Imported Lichess games use the API's numeric `clock.initial` and `clock.increment`;
chess.com games use the API's `time_control`. These clock settings take precedence
over PGN tags and are saved with collected contributions. The replay preview and
server collection use the same settings. Uploaded guest PGNs use their numeric
`TimeControl` tag; event names and speed labels are never used to guess a category.

| Estimated seconds | Speed | Authored badge |
| --- | --- | --- |
| Below 30 | Ultrabullet | StarCraft III |
| 30–59 | Hyperbullet | Adderall |
| 60–179 | Bullet | Bullet Time |
| 180–479 | Blitz | Blitz Dopamine Loop |
| 480–1499 | Rapid | Restroom Rapid Ritual |
| At least 1500 | Classical | Improover |

Each game contributes to Obsession and at most one played-speed badge. A win
also contributes once to the matching won-speed badge. Missing, invalid,
correspondence, or multi-stage controls give no speed progress. The guest notebook
still accepts completed test PGNs with those controls; profile imports enforce
their existing live-game eligibility rules. There is no additional minimum length
requirement for mileage.

StarCraft III and Adderall respect their authored hidden flags: their collection
cards and replay totals appear after their first tiers are collected.
Names, flavor, and all mileage tier thresholds remain the authored English values.

### Saved contributions

The collection uses a separate IndexedDB database, `scrapbook-local-collection`.
One record per game contains its chosen color, played PGN, contributions, and any
collected virtual continuation. Recollecting replaces that record rather than
incrementing totals again. Changing color corrects its contributions. Concurrent
tabs use an atomic read/write transaction, with notifications to refresh views.
Previously saved games do not gain newly activated badge events automatically.
Open and collect each game again to add them. Recollection preserves collected
mastery XP, analysis-based badge evidence, and virtual discoveries for the same
color. The same behavior applies
to [profile collections](local-server.md), which use the shared reward rules.

Known platform game URLs provide the identity. Otherwise, identity uses player
names, the available date/time, the initial position, and canonical moves. Comments
and formatting do not change it. Without a source ID or distinguishing timestamp,
identical games between the same players cannot be distinguished.

Mating scraps use complete canonical SAN, including captures, promotions, and
disambiguation such as `Rab2#`. Real occurrences upgrade virtual scraps and count
separately by color. Counts appear only in expanded scrap details. Virtual
occurrences never increase these counts. Each game keeps at most one collected
virtual discovery; reanalysis cannot erase it or farm additional virtual scraps.
Its saved continuation remains available even if the analysis cache changes.

Replay shows this game's progress through the selected move, separately from
overall collection totals. Scrap detail links open the actual contributing game
and its saved continuation when appropriate.

## Knight-fork mastery

The replay includes an inspection panel for the selected player's actual knight
moves, including knight underpromotions. A candidate attacks at least two enemy
pieces after the move. Pawns and kings are included. This broad geometric test
finds inspection candidates; qualification applies additional checks. It does not
detect forks created by an unmoved knight or inspect virtual continuations.

Selecting a candidate jumps to its played position and outlines the knight and
targets. Absolute pins, immediate legal captures of the knight, and attacks on
only pawns/minor pieces are shown as review warnings. Neither the presence nor
absence of a warning proves material gain or a successful fork.

Saved analysis supplies best-versus-played evaluations from the moving player's
perspective, with the engine's best move in SAN. Centipawn loss is displayed only
when both scores are centipawn scores, clamped at zero for shallow-search noise.
Mate scores remain separate. Unanalyzed moves show pending evidence. Candidates
are derived from the PGN and use existing checkpoints. The UI shows pending,
rejected, qualified, or collected mastery awards. **Collect rewards** saves XP;
analysis and inspection alone do not save a collection contribution.

Qualification rejects pinned or immediately capturable knights. At least two
targets must be credible threats, including check or a profitable legal capture.
Every legal immediate defense must leave a net material gain of at least one pawn
through a capture by the forking knight. The verifier accounts for defensive
captures elsewhere and legal recaptures on the target square. Its bounded static
exchange search may leave complex cases unresolved and does not prove the result
of longer tactics away from that square. Unresolved cases earn no XP yet.

For centipawn scores, the YAML bands select the XP award by mover-relative loss
against the best move. A move outside all bands earns nothing. A retained or newly
found winning mate, an escape from a forced loss, or maintaining/extending a forced
loss's distance receives the highest quality award. Missing a found winning mate
or shortening a forced loss earns nothing. These explicit prototype policies do
not convert mate distances into centipawns or label moves as standard mistakes.

Qualified forks receive a D- through S+ grade using the finer evaluation-loss
bands in [the mastery YAML](../../data/achievements/masteries/tactics/forks.yml).
Accepted mate outcomes receive S+. The inspector and saved contribution details
show the grade. Rejected candidates have no mastery grade; missing analysis
remains pending. These are prototype quality grades, not mistake annotations.

Levels combine cumulative saved XP with the YAML's additional S-/S/S+ fork
requirements. Levels 1–5 are XP-only. Level 6 needs two high-grade forks; level 7
needs three more; level 8 needs five more. The resulting lifetime requirements
are two, five, and ten. Each saved occurrence can satisfy only one gate, and each
qualified fork counts separately even within one game. Earlier grades can be
banked. The [design rules](../../design/mechanics/achievement-families.md#fork-grades-and-level-requirements)
describe the allocation and tuning policy.

XP is never capped by a locked grade gate. The collection shows total XP, a
bounded XP bar, and the next level's high-grade requirement. Enough XP with
insufficient grades shows that extra XP is saved; no negative XP remainder is
displayed. Once the grade requirement is met, saved XP can unlock further levels
until another unmet requirement or the last authored level.

Replay shows XP at the originating move. Contributions save the rule and grading
versions, grade, quality scores, material gain, and an illustrative defense/capture
in SAN. These hypothetical moves are evidence, not an extension of the played game.

Recollecting preserves already saved XP and evidence for the same game, color,
and ply, including after checkpoint eviction or tuning changes. Newly analyzed
qualifying moves may add contributions. Correcting the player color replaces the
game's contributions. Repricing old awards after a rule change requires a future
explicit migration; editing YAML does not automatically reprice saved awards.
Older contributions without a grade use their retained version-one engine
evidence to recover it and persist it on recollection. Unknown historical rules
stay ungraded and do not earn high-grade credit merely from their XP amount.

## Scope and limits

The interface supports English and German, with browser-language detection and a
saved manual preference. Standard chess notation and diagnostic engine/parser
details are not translated. `/help` is a player-facing help shell without articles.
`/feedback` saves a local draft on explicit request; it does not send feedback.
The draft survives reloads until cleared, subject to browser storage availability.

The guest notebook accepts one standard-chess PGN and replays its main line.
Signup cutoffs and rated-human eligibility are not enforced on manual guest
uploads. Guest collection data stays in this browser and can be lost if browser
storage is cleared or evicted. The current JSON export contains analysis, not a
collection backup. The separate [mock-profile workflow](../how-to/import-games.md)
imports eligible games and saves rewards and completed analysis on the local server.

The full engine asset exceeds Cloudflare's individual static-file limit. Hosted
delivery requires split packaging or separate asset storage. That packaging and
physical-device memory, battery, suspension, and Safari behavior remain unverified.

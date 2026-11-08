# Achievement implementation map

Recorded: 2026-11-08. Read alongside [product experience](../product/experience.md).
This maps the existing catalog to implementation needs. It does not declare every
existing description final or require the whole catalog in the first release.

## Source inventory

- `design/content/achievement-ideas.md`: family concepts, episodes, tactical mastery ideas,
  hidden scraps, shelved mechanics, streak/diversity/group conditions.
- `design/content/quote-ideas.md`: writing reference, not executable rules.
- Twenty badge YAML files: 61 unique badge definitions and 515 tier entries.
- `masteries/tactics/forks.yml`: the first tactical mastery, with quality-based XP
  awards, a rule version, and level thresholds.
- `mastery.json`: eight opening tracks, split by player color.
- `scraps/`: eight named one-time scrap definitions, classified in YAML and still
  marked as drafts pending unlock rules and detectors.
- `story.json`: five prerequisite-linked onboarding nodes.
- Checkmate notation scraps and their virtual/real behavior are specified in the
  [checkmate scrap rules](../mechanics/checkmate-scraps.md), not yet in a complete content catalog.

## Processing model

See the [proposed achievement pipeline](../../docs/explanation/achievement-processing.md).

## Badge mechanics

All 61 YAML badges are active, with complete names, taxonomy, base flavor, and
all 515 tier entries. Each formerly unfinished badge was implemented and merged
separately. Existing IDs, tier amounts, and nonempty writing are preserved;
previously blank names and flavor now have initial writing for the author to tune.

The [badge qualification reference](../../docs/reference/badge-rules.md) is the
single description of implemented calendar, phase, clock, development, precision,
clean-material, comeback, draw-recovery, and punishment rules. The
[browser reference](../../docs/reference/browser-proof.md#active-board-event-badges)
covers factual moves, ratings, speed, and castling. Values remain authoritative in
[YAML](../../data/achievements/badges/) and the linked detectors.

The user's decisions are to use Settings time zones for local game-start calendar
rewards, Lichess's phase divider, and Lichess's mistake/blunder convention while
ignoring inaccuracies. All six source time controls apply to both played and won
badges, with both platforms calculated using the same duration convention.

The first implementation also makes explicit, revisable choices where the old
catalog was incomplete: clock comparison samples and scramble duration; ten-ply
clean-gain confirmation; phase-boundary comeback sampling; the lost-position draw
threshold; and the advantage-retention slack after an opponent error. These are
prototype interpretations, not additional decisions attributed to the user.
See [badge design boundaries](../mechanics/achievement-families.md#badge-qualification-and-tuning).

Missing clocks, ratings, timestamps, analysis, or draw reasons do not establish a
qualifying event. In particular, generic Lichess draw status cannot prove agreement.
Source limitations are exposed in the qualification reference rather than hidden
behind fabricated achievements. Engine continuations remain exclusive to virtual
scraps; they never provide actual badge events or survival turns.

## Mastery, story, and scraps

Tactical tracks use the [mastery progression rules](../mechanics/achievement-families.md#mastery-progression).
The former feat definitions are [named scraps](../mechanics/achievement-families.md#named-scraps).
Their original IDs, text, and hidden flags are retained in the scrap YAML catalog;
classification does not activate the unresolved mechanics below.

| Mechanic and source | Implementation | Open design |
| --- | --- | --- |
| Sicilian, Caro-Kann, King's Gambit, Rapport-Jobava, each White/Black (`mastery.json`, 8 tracks) | Opening identification, player color, game-quality facts, XP contribution | XP formula; ECO precision/transpositions; consistent opening names; thresholds are currently C/B/A/S/S+ |
| Knight fork (`masteries/tactics/forks.yml`) | Material-threat checks, Stockfish quality-based XP, levels, saved replay contributions | Tune the prototype values; longer tactical sequences, other forking pieces, and repeated motifs |
| Skewer, discovery (design notes) | chessops attacks/rays and before/after board relationships; Stockfish quality gate | Qualifying targets, pinned pieces, discovered checks, repeated motifs, non-blunder versus good move |
| Pawn, exchange, piece sacrifice; seven-man standing (design notes) | Sequence/material tracking, engine compensation, piece-count snapshots | Intentional sacrifice versus blunder, return window, exact seven-man condition |
| Best retreating move (design notes) | Piece motion classification plus engine best-move comparison | Meaning of retreat and treatment of equivalent best moves |
| Five onboarding story nodes (`story.json`) | Prerequisite graph plus explicit completion predicates | Existing JSON has prerequisites but lacks executable completion predicates; replace Lichess-only wording |
| Main story and independent episodes; Finegold trigger (design notes) | Episode definitions, unlock events, prerequisite graph, narrative content | Mission rules, historical eligibility after episode unlock, same-game prerequisite chaining |
| Checkmate notation scraps (decision document) | Canonical mating-move identity; one collectible with real/virtual state; real counts by color | Exact identity vocabulary and virtual alternative-line policy |
| Connect Four (`feat_connect_four`) | Four adjacent friendly pawns on a rank, detected from board state | Starting position would qualify unless ranks/context are restricted |
| Botez Gambit (`feat_botez_gambit`) | Queen-loss sequence plus engine compensation check | What establishes no compensation; deliberate bad-play incentives |
| Bongcloud played/faced (`feat_bongcloud_played`, `feat_bongcloud_faced`) | Opening move-sequence detector and player/opponent roles | Black equivalent; exact sequence versus transpositions |
| Lone kings (`feat_lone_kings`) | Board piece-count event | Keep as a hidden discovery if still desired |
| Marathon (`feat_marathon_120`) | Game length plus win; potential stalling detector | Design notes shelve long-game incentives; do not activate old JSON automatically |
| Perfect game (`feat_perfect_game`) | Win with no inaccuracies, mistakes, blunders | Quality thresholds; coexistence with repeatable badges |
| Tragic timeout (`feat_tragic_timeout`) | Timeout loss while evaluation exceeds +5 for player | Final evaluation timing; source termination fidelity |
| Specific mating sequence, best queen sacrifice, holiday win, every move ≤5 seconds (design notes) | Sequence matcher; quality gate; calendar; normalized clocks | Exact patterns, holiday calendar, move-time derivation and missing data |
| Opponent resigns while winning, "Huh?" (design notes) | Resignation plus opponent-relative evaluation | Winning threshold; retain shelved/hidden status until authored |
| Achievement groups, streaks, diversity (design notes) | Cross-game aggregates and prerequisite sets | Definitions, ordering, ties across platforms, reset semantics |

## Content structure and validation

- Load all nested YAML files, not just the top-level directory.
- Preserve IDs while evolving the schema. Explicitly migrate JSON ideas if they
  become active content; keep draft content distinguishable from active rules.
- Support badge-specific tier sets. Current data includes 32 stone tiers and an
  older bronze/silver/gold promotion badge. Do not assume every badge shares tiers.
- Support multiple crossed thresholds in one contribution without losing unlocks.
- Preserve structured flavor (`text`, `quote`, `player_quote`, `author`) and adapt
  legacy `flavor_text` deliberately. Define a supported safe rich-text format for
  existing Markdown, HTML italics, and mathematical notation.
- `compliance_filters` is authored satirical presentation content. Its eventual
  behavior needs specification; it is not an instruction to sanitize the writing.
- Flag duplicate thresholds, incomplete names, unknown metrics, missing conditions,
  broken prerequisites, and graph cycles. Draft content can remain incomplete;
  active content must be executable and valid.
- A missing clock, rating, or engine result means unknown, not automatically zero
  or false. Do not award "flawless" for unanalyzed moves.

## Implemented collection loop

The browser proof, local mock profiles, manual Lichess/chess.com imports, and
SQLite-backed profile rewards are implemented. See the
[import workflow](../../docs/how-to/import-games.md) and current
[processing explanation](../../docs/explanation/achievement-processing.md).
The dated [browser proof QA record](../../docs/qa/browser-proof.md) retains the
limits of that audit; it is not a claim about every later badge.

The loop includes all YAML badges, knight-fork mastery, and exact-SAN real/virtual
mating scraps. Collection is idempotent, color correction replaces the game's
contributions, and explicit recollection adds newly available awards. Previously
collected engine evidence and virtual discoveries survive cache eviction for the
same color. General bulk recalculation after rule changes remains undecided.

Replay shows progress through the selected move and confirms delayed badge events
when their required evidence becomes available. Sequence awards retain their
originating move as well as confirmation. Reveals support multiple crossed tiers,
including existing duplicate tier thresholds and nonstandard promotion tiers.

A knight-fork inspector lists actual moved-knight candidates and their targets,
pin/capture warnings, engine comparisons, and qualification or pending status.
Geometric false positives remain visible for review but earn no mastery XP.

The intended qualification has two independent tests: the fork must threaten to
win net material, including an exchange, and the engine must judge the move that
creates it good or at least not bad. Assess the threat when the move is played;
the opponent need not actually concede material in the played continuation.
Account for pins and captures/recaptures rather than treating every pair of
attacked pieces as a profitable threat. A good engine evaluation alone does not
prove the fork threatens material gain.

The first material test rejects pinned or immediately capturable knights, then
requires two credible threats and a profitable capture after every legal immediate
defense. Legal static exchanges account for recaptures on the capture square.
This bounded test is conservative and does not resolve longer tactics away from
that square. The [browser reference](../../docs/reference/browser-proof.md#knight-fork-mastery)
describes its award and evidence behavior.

Clean-material badges now use the shared Lichess mistake/blunder classifier.
The knight-fork YAML separately supplies prototype quality bands and XP awards.
These are tuning rules,
not claims about standard mistake categories. Mate outcomes are compared separately
from centipawn losses. Repeated collection of the same move does not add XP again.

## Remaining design and release work

Other tactical and opening masteries, story predicates/episodes, and the draft
named scraps above still need authored rules. Their presence in YAML, JSON, or
notes does not activate them. Tune badge balance and new writing with actual
collected games before expanding cross-game groups, streaks, and diversity rules.

Production authentication, platform ownership verification, final hosting, and
board renderer remain unselected. The local mock login and multiple-account
option remain development-only. Presentation and art direction are intentionally
deferred while the author develops a distinct style. Physical-phone testing,
interruption recovery, export/backups, and hosted engine delivery still matter
for release; completing badges alone does not make this a production service.

Revisit prototype badge sampling/balance and rule-update migration deliberately.
Do not retroactively imply that an implementation default was an approved product
rule. Preserve the authored tier curves while reviewing further mastery XP and
narrative progression.

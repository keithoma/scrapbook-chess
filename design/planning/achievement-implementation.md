# Achievement implementation map

Recorded: 2026-11-08. Read alongside [product experience](../product/experience.md).
This maps the existing catalog to implementation needs. It does not declare every
existing description final or require the whole catalog in the first release.

## Source inventory

- `design/content/achievement-ideas.md`: family concepts, episodes, tactical mastery ideas,
  hidden scraps, shelved mechanics, streak/diversity/group conditions.
- `design/content/quote-ideas.md`: writing reference, not executable rules.
- Twelve YAML files: 61 unique badge definitions and 515 tier entries.
- `mastery.json`: eight opening tracks, split by player color.
- `feats.json`: eight one-time ideas, a legacy source for scraps.
- `story.json`: five prerequisite-linked onboarding nodes.
- Checkmate notation scraps and their virtual/real behavior are specified in the
  [checkmate scrap rules](../mechanics/checkmate-scraps.md), not yet in a complete content catalog.

## Processing model

See the [proposed achievement pipeline](../../docs/explanation/achievement-processing.md).

## Badge mechanics: all current YAML definitions

Paths below are relative to `data/achievements/`.

| Source and definitions | Required facts / detector | Unresolved semantics |
| --- | --- | --- |
| `badges/veterancy/mileage.yml`: `badge_played_total`; `badge_played_{ultrabullet,hyperbullet,bullet,blitz,rapid,classical}` (7) | Eligible completed game; normalized speed | Exact speed boundaries and increments; minimum game length |
| `badges/domination/body_count.yml`: `badge_won_total`; `badge_won_{ultrabullet,hyperbullet,bullet,blitz,rapid,classical}` (7) | Same, plus player-relative win | Same speed mapping |
| `badges/veterancy/consolation_prize.yml`: `badge_moves_played` (1) | One contribution per actual player move | Description says one move; tiers start at 100; confirm cumulative intent |
| `badges/veterancy/dailyscape.yml`: `badge_played_{monday,tuesday,wednesday,thursday,friday,saturday,sunday}` (7) | Calendar classification of eligible game | Start or end timestamp; profile timezone and later timezone changes |
| `badges/veterancy/chronotype.yml`: `badge_played_time_{00_04,04_08,08_12,12_16,16_20,20_24}` (6) | Six four-hour local-time blocks | Same timestamp/timezone decisions |
| `badges/domination/work-life_balance.yml`: `badge_won_weekday`, `badge_won_weekend` (2) | Calendar classification plus win | Same calendar decisions |
| `badges/domination/phasewise.yml`: `badge_won_opening`, `badge_won_middlegame`, `badge_won_endgame` (3) | Phase at game end plus win | Define phase from position/opening knowledge rather than inheriting prototype move-count heuristics |
| `badges/domination/chessdom.yml`: `badge_time_advantage`, `badge_time_scramble` (2) | Per-ply clocks and increments plus win | Comparison sampling, equality, missing clocks, scramble threshold/duration |
| `badges_meta.yml`: `badge_upset`, `hold_your_own` (2) | Player/opponent pregame ratings and result; +100 win / +150 draw thresholds | Provisional or missing ratings; ratings stay platform-specific |
| `badges_position.yml`: `badge_material_total` (1) | Actual captures and captured piece values | En passant, promotion values, and whether trades simply count as captures |
| Same: `badge_en_passant`, `badge_promotion`, `badge_total_checks` (3) | Actual move events from legal board transitions | All promotions versus separate underpromotion content; quality gates if any |
| Same: `badge_opposite_side_casteling` (1; preserve existing ID) | Track both castling directions plus win | No need to rename stable ID just to correct spelling |
| Same: `badge_fianchetto_total` (1) | Bishop development pattern | A genuine fianchetto versus repeatedly moving onto b2/g2/b7/g7 |
| `badges_hybrid.yml`: `badge_clean_pawns`, `badge_clean_knight`, `badge_clean_bishop`, `badge_clean_rook`, `badge_clean_queen` (5) | Net material gain over a tactical sequence, quality gate, subsequent survival | Define five turns, exchanges/recaptures, compensation, early game end, and credit per sequence |
| `badges_evaluation.yml`: `badge_draw_lost_threefold`, `badge_draw_lost_agreement`, `badge_draw_lost_50move`, `badge_draw_lost_insufficient` (4) | Evaluation history plus actual termination reason and relevant board history | Define lost threshold/duration; claimable versus actual draw reason; source data availability |
| Same: `badge_comeback_1_5_late`, `badge_comeback_2_0_fast`, `badge_comeback_3_0_mid`, `badge_comeback_endgame_2_0` (4) | Phase boundaries, evaluation trajectory, result, elapsed moves | Point-in-time versus sustained deficit; start of 20-move window; draw-or-win endgame exception |
| Same: `badge_perfect_eval`, `badge_no_blunders`, `badge_no_mistakes_blunders` (3) | Consistent evaluation perspective; quality classification across player moves; win | Sampling and quality thresholds; exact asymmetric White/Black limits in perfect-eval description |
| Same: `badge_punish_mistakes`, `badge_punish_blunders` (2) | Opponent quality loss followed by player exploitation | How much advantage must be retained, response window, credit per error |

Total: 61 definitions. Braces in the table abbreviate explicit IDs, not a new rule
syntax. Calendar/speed concepts should be shared across badges rather than
implemented separately for each content file.

## Mastery, story, and scraps

| Mechanic and source | Implementation | Open design |
| --- | --- | --- |
| Sicilian, Caro-Kann, King's Gambit, Rapport-Jobava, each White/Black (`mastery.json`, 8 tracks) | Opening identification, player color, game-quality facts, XP contribution | XP formula; ECO precision/transpositions; consistent opening names; thresholds are currently C/B/A/S/S+ |
| Fork, skewer, discovery (`design/content/achievement-ideas.md`) | chessops attacks/rays and before/after board relationships; Stockfish quality gate | Qualifying targets, pinned pieces, discovered checks, repeated motifs, non-blunder versus good move |
| Pawn, exchange, piece sacrifice; seven-man standing (same) | Sequence/material tracking, engine compensation, piece-count snapshots | Intentional sacrifice versus blunder, return window, exact seven-man condition |
| Best retreating move (same) | Piece motion classification plus engine best-move comparison | Meaning of retreat and treatment of equivalent best moves |
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

## Implementation milestones and meaningful checks

Browser proof status: implemented and tested in desktop Chrome and mobile Chrome
emulation. See [the verification record](../../docs/qa/browser-proof.md). Physical-phone checks
and engine packaging for hosted delivery remain open.

The first local collection loop now includes Obsession, Effort, The French Move,
and exact-SAN real/virtual mating scraps. It supports per-game color selection,
replay contributions, local persistence, and reward reveals. Tactical mastery,
opening XP, narrative progression, accounts, and imports remain future work.

1. **Browser proof:** chessops legal replay, full browser Stockfish at initial
   depth 6, explicit 20-ply continuation limit, checkpoint/resume, desktop and phone.
   Verify actual game moves remain unchanged and engine memory/startup are usable.
2. **Reward vertical slice:** one cumulative badge, one tactical mastery detector,
   real/virtual mating scraps, move-linked evidence, collection state, and reveals.
   Verify virtual→real upgrade and real-only counts by color.
3. **Hosted profile and imports:** selected authentication, both platform adapters,
   signup cutoff, rated-human eligibility, normalized speeds/clocks, local account
   override, platform history, persistent results. Verify retries and two-device
   submissions cannot duplicate contributions.
4. **Broader mechanics:** clean material sequences, evaluation/phase conditions,
   calendar/clock families, opening mastery, and one short narrative chain.
   Use curated positions/games with counterexamples for detectors; do not merely
   test that a detector returns its own expected intermediate values.
5. **Presentation and release:** Tailwind responsive collection/replay, reward
   pacing/effects, interruption/error recovery, data export/backups, deployment.
   Check touch navigation and suspended/resumed analysis on actual mobile hardware.

The order can overlap after the browser proof. No destructive replacement is
required to validate that proof. Existing content outside the vertical slice can
remain draft while the author develops it.

## Decisions needed before activating affected mechanics

- Speed boundaries, game-length eligibility, timestamp/timezone semantics.
- Phase boundaries, quality thresholds, clean-gain and motif definitions.
- Production terminal-game eligibility and tuning of the bounded virtual search.
- XP formula, narrative completion/retroactivity, streak/diversity definitions.
- Rule-update/recalculation policy: preserve, backfill, or rebuild existing awards.
- Authentication, ownership verification, board renderer, final hosting/database.

Resolve these when the relevant mechanic is implemented; do not block unrelated
work or quietly inherit prototype heuristics as product rules.

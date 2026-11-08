# Proposed achievement processing

This explains the intended separation of chess facts, achievement decisions, and
collection state for implementers. It is a target architecture: the current
[browser proof](browser-analysis.md) does not yet evaluate achievements or save
collections on a server.

1. **Import:** retain source identity and raw payload/PGN; normalize players,
   clocks, time settings, opening metadata, timestamps, result, and termination.
2. **Validate and replay:** use chessops to validate moves and derive board states.
   PGN syntax parsing alone does not establish move legality.
3. **Extract facts:** emit captures, checks, promotions, material changes, attacks,
   clock observations, opening/phase observations, and game-end events.
4. **Analyze:** browser Stockfish supplies player-perspective evaluations, candidate
   moves, quality judgments, and separately labeled simulation branches.
5. **Detect:** specialized detectors combine facts over moves/sequences and report
   evidence. YAML selects a detector and supplies supported parameters.
6. **Evaluate and persist:** apply family-specific rules and cross-game state,
   commit contributions once, and update collection projections.
7. **Present:** render saved contributions and unlocks in reveals and replay.

Keep chess facts, authored rules, and collection state separate. Avoid one giant
metrics class or arbitrary executable expressions embedded in YAML.

Each contribution should identify the profile, platform/game, rule version,
detector version, contribution kind/amount, originating ply or sequence, and
supporting facts. Track confirmation timing when later moves are required.
Use a stable occurrence identity to prevent duplicates on retries or two devices.
Persist awards and their progress updates atomically. A user's processing state
must not live solely on the shared game record.

See the [mechanic implementation map](../../design/planning/achievement-implementation.md)
for the catalog-specific detectors and open rules.

## Trust and future persistence

Browser-computed engine results are acceptable for the initial personal release.
A future server must still enforce ownership, eligibility, rule evaluation, and
duplicate prevention; clients must not submit arbitrary collection balances.
Store completed results for cross-device replay. Version engine settings,
detectors, and definitions, and decide the recalculation policy before applying
rule changes to existing collections.

Cloudflare Workers and D1 are proposed hosting choices, not an implemented
backend. Authentication and the production board renderer are not selected.

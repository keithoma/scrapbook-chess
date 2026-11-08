# Proposed achievement processing

This explains the intended separation of chess facts, achievement decisions, and
collection state for implementers. It is a target architecture: the current
[local prototype](browser-analysis.md) implements three badges, knight-fork
mastery, and mating scraps.
Imported-game contributions are evaluated and persisted by the local server using
the same rules as the guest notebook. A general detector registry and hosted
persistence remain planned.

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
The local server enforces profile scoping, import eligibility, rule evaluation,
and duplicate prevention. It derives color and played moves from imported data;
clients do not submit collection balances. Proper authentication and platform
ownership verification are deferred, with mock login restricted to development.
Completed imported-game analysis is saved for replay from another browser using
the same server. Version engine settings,
detectors, and definitions, and decide the recalculation policy before applying
rule changes to existing collections.

The implemented backend is a local Node.js server with SQLite. Earlier Cloudflare
Workers/D1 hosting ideas are not implemented; a hosted deployment, authentication,
and the production board renderer remain unselected. See the
[local server reference](../reference/local-server.md) for its boundaries.

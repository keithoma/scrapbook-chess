# How browser analysis works

The TypeScript app runs chess analysis in the user's browser. This keeps engine
compute off a hosted backend and makes a low-cost first release practical. The
current implementation is a local collection prototype.

## Chess operations and engine analysis

chessops parses the PGN, checks moves against legal positions, and constructs the
replay frames. Its castling representation is converted to standard UCI before
being sent to Stockfish. The actual played line is never extended by a simulation.

Full single-threaded Stockfish runs in a dedicated Web Worker. Before each played
move, it searches for its top three choices using MultiPV, or all legal moves if
fewer than three exist. Ranked choices retain their individual evaluations at
the same completed depth. A played choice uses its saved ranked evaluation;
a move outside those choices receives a separate forced search. All scores are
normalized to White's perspective. The UI can navigate while the worker computes.

Each played move also receives shared quality and book-move annotations for its
mover, covering both players. Replay, saved analysis, and opening mastery reuse
the [book-move definition](../reference/opening-masteries.md#shared-book-move-definition).
The current book lacks per-move frequency counts and results, so eligible moves
remain visibly unverified candidates. The engine's evaluations do not substitute
for missing historical loss statistics.

The [shared best/only-move rules](../../web/src/chess/move-rules.ts) also annotate
both players. Review displays the played evaluation and ranked choices in chess
notation; see the [definitions](../reference/browser-proof.md#move-evaluations-and-shared-labels).
The inaccuracy threshold comes from the same Lichess judgment function as mistakes
and blunders. Existing achievement and book gates continue to allow inaccuracies.

We favor completing the chosen analysis settings over reducing quality to meet
a short deadline on weaker hardware. The initial depth is an experiment, not a
verified Elo rating or guarantee of tactical accuracy. Configuration is indexed
in [the browser reference](../reference/browser-proof.md).

## Checkpoints and simulated endings

Each completed move is saved before the next one is processed. Reloading restores
the local checkpoint; an interrupted position may need to be searched again.
The engine's internal search/hash state is not checkpointed, so resumed shallow
searches can differ from uninterrupted searches. Saved completed results remain.

Older checkpoints remain reviewable with their existing scores. **Add engine
choices** fills missing ranked-choice evidence and refreshes those moves' scores.
An interrupted upgrade resumes without repeating moves whose choices were saved.
Absent second-choice evidence never establishes an only move. Collected awards
retain their saved evidence and values. Synchronization prefers enriched analysis
over an older checkpoint with the same number of analyzed moves.

After the played moves, the engine can explore a separately labeled continuation
from the final position. Each simulated ply is saved independently. A terminal
position stops it; otherwise the configured ply limit bounds the work. This
supports [virtual scraps](../../design/mechanics/checkmate-scraps.md). A collected
finish belongs to the selected player's side; the opponent's mate earns no scrap.

When a player's normal finish repeats a scrap owned from another game, the app
can examine the last three player decisions in that continuation. At each decision
it considers one alternative that the engine judges no worse at the current
depth, or another winning mate. Subsequent defense uses unrestricted engine
searches. Every candidate remains bounded by the continuation limit. This is
generous engine-based play, not a proof of forced mate or exhaustive novelty search.

Choosing the player color before analysis enables this search automatically.
If a repeated finish was analyzed before choosing a color, **Look for another
virtual finish** runs the bounded search explicitly. A game that already contributed
a virtual discovery keeps that discovery rather than farming alternative finishes.

The browser can suspend or terminate work when the page closes or a phone sleeps.
Checkpoints preserve completed work, not reliable background execution. Imported
games also save completed analysis and collected rewards to the local server,
allowing another browser on that server to restore them. Guest storage remains
browser-local. Proper authentication and hosted synchronization are deferred.

## Evidence and next boundaries

The [dated verification record](../qa/browser-proof.md) measures desktop Chrome
and mobile viewport emulation. Physical-phone testing is still required before
selecting this full engine build as the universal mobile default. Its large
download and hosting packaging are material deployment considerations.

The [proposed achievement pipeline](achievement-processing.md) separates chess
facts, rule evaluation, and collection state. The local contribution ledger now
implements the [complete YAML badge catalog](../reference/badge-rules.md),
[tactical](../reference/tactical-masteries.md), [opening](../reference/opening-masteries.md),
and [endgame masteries](../reference/endgame-masteries.md), and mating scraps. The local server reuses those rules for
imported profile games. Further mastery and story detectors, and hosted
persistence, remain planned. See
[product experience](../../design/product/experience.md) for intended behavior.

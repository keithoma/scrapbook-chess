# How browser analysis works

The TypeScript app runs chess analysis in the user's browser. This keeps engine
compute off a hosted backend and makes a low-cost first release practical. The
current implementation is a local proof; the original Python CLI remains separate.

## Chess operations and engine analysis

chessops parses the PGN, checks moves against legal positions, and constructs the
replay frames. Its castling representation is converted to standard UCI before
being sent to Stockfish. The actual played line is never extended by a simulation.

Full single-threaded Stockfish runs in a dedicated Web Worker. Before each played
move, it searches for the best move. If the player chose another move, a second
search forces that choice. Both evaluations are normalized to White's perspective.
The UI can navigate the game while the worker computes.

We favor completing the chosen analysis settings over reducing quality to meet
a short deadline on weaker hardware. The initial depth is an experiment, not a
verified Elo rating or guarantee of tactical accuracy. Configuration is indexed
in [the browser reference](../reference/browser-proof.md).

## Checkpoints and simulated endings

Each completed move is saved before the next one is processed. Reloading restores
the local checkpoint; an interrupted position may need to be searched again.
The engine's internal search/hash state is not checkpointed, so resumed shallow
searches can differ from uninterrupted searches. Saved completed results remain.

After the played moves, the engine can explore a separately labeled continuation
from the final position. Each simulated ply is saved independently. A terminal
position stops it; otherwise the configured ply limit bounds the work. This
demonstrates the basis for [virtual scraps](../../design/mechanics/checkmate-scraps.md),
but collection awards and alternative-finish selection are not implemented yet.

The browser can suspend or terminate work when the page closes or a phone sleeps.
Checkpoints preserve completed work, not reliable background execution. Future
server persistence will make completed collections available across devices;
current local storage does not provide that synchronization.

## Evidence and next boundaries

The [dated verification record](../qa/browser-proof.md) measures desktop Chrome
and mobile viewport emulation. Physical-phone testing is still required before
selecting this full engine build as the universal mobile default. Its large
download and hosting packaging are material deployment considerations.

The next logical boundary is the [proposed achievement pipeline](achievement-processing.md),
which separates chess facts, rule evaluation, and collection state. See
[product experience](../../design/product/experience.md) for intended behavior.

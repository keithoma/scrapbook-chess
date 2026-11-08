# Checkmate scraps

These are agreed game-design rules. The current browser proof only demonstrates
a separate engine continuation; it does not yet award or collect scraps.

- Each mating scrap is one collectible, regardless of the player's color.
- Real: the player delivered the corresponding checkmate in the actual game.
- Virtual: an engine continuation from the final position delivers that checkmate
  for the player. A forced-mate score is NOT required by the agreed generous rule.
- Real and virtual states must be visually distinct. A real occurrence upgrades
  a virtual collectible; it does not create a second collection entry.
- Count real occurrences separately for White and Black. Do not count virtual
  occurrences. Show counts only inside scrap details, not on collection tiles.
- The starting continuation limit is 20 additional plies (10 full moves), tunable
  after observing actual games. This is a continuation length, not search depth.
- Give virtual finishes bounded flexibility to find a still-uncollected scrap
  rather than repeatedly ending in an already-collected one.
- The alternative-line search budget and acceptable move-quality tolerance remain
  open. Do not promise that a new finish exists. Do not deliberately make the
  defending side cooperate to manufacture a scrap.
- The actual simulated mating move determines the virtual scrap, even if it differs
  from an earlier engine prediction.
- Keep actual game moves immutable. Store and label simulation separately in replay.
- Eligibility of terminal losses, draws, and timeouts for simulation, and exact
  notation identity (captures, promotion, disambiguation), still need decisions.

See [browser analysis](../../docs/explanation/browser-analysis.md) for the current
implementation and [the implementation map](../planning/achievement-implementation.md)
for the remaining work.

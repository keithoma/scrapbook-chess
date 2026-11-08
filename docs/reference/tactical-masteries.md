# Tactical masteries

Knight forks and skewers have separate XP, grades, levels, and high-grade
requirements. Their [definitions](../../data/achievements/masteries/tactics/)
reference one [tactical progression policy](../../data/rules/tactical-mastery.yml).
The [mastery module](../../web/src/achievements/mastery.ts) resolves and validates
that policy for each track. Shared tuning does not combine their balances.

## Shared progression

A qualifying tactic must first prove a material threat. Stockfish then compares
the actual creating move with the best move from the mover's perspective. Missing,
stale, or unrelated analysis leaves the award pending. A completed game and
**Collect rewards** are required to save progress; inspection alone saves none.
Actual moves supply mastery events. Virtual continuations do not.

The common YAML defines quality-based XP, all 15 grades from D- through S+, and
the existing level XP thresholds. Grade bands subdivide the XP bands. Centipawn
loss is clamped at zero for shallow-search noise; a move outside the quality gate
earns no XP or grade. These are prototype tuning values, not standard chess
annotations or Lichess mistake categories. Existing fork awards and thresholds
were preserved when the policy moved to its shared location.

A retained or newly found winning mate, an escape from a forced loss, or preserving
or extending a forced loss's distance receives the highest quality award and S+.
Missing a found winning mate or shortening a forced loss earns nothing. Mate
distances are never converted into arbitrary centipawn values.

Levels 1–5 require only XP. Level 6 also requires two S-/S/S+ occurrences in that
track, level 7 needs three additional occurrences, and level 8 needs five more.
Lifetime requirements are therefore two, five, and ten. Each occurrence satisfies
one grade gate. Earlier grades can be banked. XP keeps accumulating while locked;
meeting a gate can immediately unlock further XP-qualified levels until another
unmet requirement. Levels above eight retain the earlier requirements and use
their existing XP thresholds without further grade costs.

The collection shows lifetime high grades and the next gate's separate batch
progress. Its XP bar stays bounded while total XP remains uncapped. Correcting
a game's color replaces its contributions and derived progress. Fork grades
cannot satisfy skewer gates, or vice versa.

## Knight forks

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

Qualification rejects pinned knights. At least two targets must be credible
threats, including check or a profitable legal capture. Every legal immediate
defense must leave a net material gain of at least one pawn through a capture by
the forking knight or a legal recapture of the piece that captured it. A capturable
knight can therefore qualify when taking it loses material. Unrelated hanging
pieces cannot compensate for losing the knight. The verifier accounts for
defensive captures elsewhere and legal recaptures on the target square, including
the loss of the knight. Gain is measured from the position after the creating
move; material captured by that move cannot prove its new fork. Its bounded
static exchange search may leave complex cases unresolved and does not prove
the result of longer tactics away from that square. Unresolved cases earn no XP yet.

## Skewers

The [skewer detector](../../web/src/tactics/skewers.ts) scans newly created bishop,
rook, and queen rays in actual played positions. The nearest two occupied squares
on a ray must hold enemy pieces, with the more valuable piece in front. The king
is highest for this comparison. Pins, equal-value pairs, and lines interrupted by
a friendly piece are excluded. This follows the ordinary
[skewer definition](https://www.chess.com/terms/skewer-chess); geometric alignment
alone does not establish mastery qualification.

Creation may come from moving the slider, promoting into one, or moving another
piece to uncover its ray. Existing alignments and slider shuffles that preserve
the same front/rear pair do not create another occurrence. Multiple new rays on
one move can supply evidence, but the track awards at most once per actual ply.
A move can independently earn fork and skewer mastery when both qualify.

Every legal immediate defense must still leave at least a pawn of net material
gain against the original targets after legal recaptures. The verifier considers
king and target moves, interpositions, checks, captures elsewhere, and captures
of the attacker. If a skewered front piece captures a defended attacker, a
profitable legal recapture of that same target can establish the gain. Captures
of unrelated hanging pieces cannot supply the proof. The opponent need not
actually concede the rear piece in the recorded game; a win is not required.

This bounded static-exchange test is a conservative prototype. It does not solve
longer combinations, and harmless geometric skewers can be rejected when a defense
saves the material. Search-budget exhaustion leaves material unresolved and earns
no XP. Accepted candidates still need the common engine quality gate.

The inspector lists actual candidate plies, front/rear squares, engine evidence,
and qualification. The board marks the attacker and both targets. Saved evidence
includes the original three squares and an illustrative defense/capture for replay.
The hypothetical continuation is labeled and does not alter actual game moves.

## Saved awards and local examples

Per-game retention keys include both mastery ID and ply. Retrying collection,
using another tab, or evicting analysis cannot duplicate an occurrence or overwrite
another track at the same ply. Saved grade, XP, rule/grading/analysis versions,
and material evidence remain stable through reanalysis and tuning changes.
Changing saved award policies requires an explicit migration.

Older fork contributions without grades recover them from retained known-rule
engine evidence and persist them on recollection, without rerunning Stockfish or
repricing XP. Unknown historical rules remain ungraded; XP alone never proves a
high grade.

In Notebook, open the PGN controls and choose **Fork example** or **Skewer
example**, then choose White. The [fork example](../../web/src/fixtures/games/knight-fork.pgn)
shows a knight fork. The [skewer example](../../web/src/fixtures/games/skewer.pgn)
shows Bb2+, attacking the king on d4 with the rook behind it on e5. Analyze and
collect, then use the contribution's replay button in its own mastery card.
The surrounding interface and track labels support English and German.

## Development review fixtures

When running `pnpm dev`, select a fork or skewer candidate after completing
analysis. Its **Development review** controls offer **Should earn XP** and
**Should earn 0 XP**. These choices record whether the tactic deserves any
experience, without choosing an exact amount or changing collected rewards.

The development server saves each judgment as a JSON file under
`web/src/fixtures/tactical-reviews/`, including the PGN, actual ply, mastery ID,
captured engine scores, and current qualification result. The game, ply, and
mastery identify the fixture. Changing a judgment replaces that file; revisiting
the candidate or reloading restores the saved choice. A failed write displays an
error and retains the last saved choice. These files can be committed with other
fixtures. They are separate from browser storage and profile data.

The [review regression tests](../../web/src/tactics/review-fixture.test.ts)
automatically load every saved judgment during `pnpm --dir web test`. They replay
the captured scores through the current shared award rules, without running
Stockfish. Positive judgments require XP greater than zero; negative judgments
require exactly zero. A judgment that disagrees with the implementation therefore
creates a failing regression case until the rules or judgment are corrected.
The original engine version remains recorded as provenance; tests reuse the
frozen scores when exercising newer rules.

Both the controls and the fixture-writing endpoint are development-only. They
are unavailable in production builds and `vite preview`. The shared review
control identifies tactics by mastery ID so future tactical inspectors can reuse
the same storage and regression workflow.

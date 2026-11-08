# Endgame masteries

Pawn vs Pawn is the first endgame mastery. Its
[definition](../../data/achievements/masteries/endgames/pawn-vs-pawn.yml) uses an
independent [endgame scoring policy](../../data/rules/endgame-mastery.yml).
The initial weights, evaluation boundary, and score bands are prototype tuning,
not final balance decisions or standard chess accuracy grades.

## Recognition and scope

The [shared material rule](../../web/src/chess/endgames.ts) requires at least one
pawn on each side and no pieces other than kings and pawns. Recognition uses the
first qualifying actual position, including an initial FEN. It does not use the
general opening/middlegame/endgame phase divider.

Scoring begins with the moves after that position. The move removing the final
non-pawn piece belongs to the preceding play. At least one subsequent move by
the selected player is required. The assessment follows the game through its
actual finish, including promotions, loss of the last pawn, and play with promoted
pieces. Returning to pawn-only material never starts a second award.

## Results and quality

[Assessment](../../web/src/endgames/mastery.ts) needs complete, matching current
analysis and a finished game. Missing, stale, partial, or invalid analysis stays
pending. Each side is assessed independently from its own perspective, but only
the selected player's award is collected. Actual checkmate determines the winner
even if a conflicting result tag is present. Virtual continuations supply no
recognition, moves, result, XP, or grade.

The first position's engine evaluation classifies the start as winning, even, or
losing, using the policy's inclusive even range. That classification is fixed.
Losing an advantage later cannot manufacture a new comeback bonus. These are
shallow engine estimates, not tablebase verdicts.

The result supplies the main score. For comparable move quality, a comeback win
scores above a win from equality, which scores above conversion of an already
winning ending. Saving a losing ending as a draw earns more than holding an even
one or drawing an already winning one. From an even start, even the lowest-quality
win scores above the most accurate draw or loss.

Only the selected player's moves affect move quality. Their best-versus-played
scores use the [shared winning-chances function](../../web/src/chess/quality.ts),
with mate outcomes treated categorically rather than converted into centipawns.
The average loss and worst individual loss reduce quality. Keeping the worst
loss in the calculation prevents many accurate shuffling moves from erasing a
serious error. More moves alone do not add XP. The worst-loss penalty can still
be partly moderated by improved average play; it is not a complete anti-stalling
or difficulty measure.

The outcome score is multiplied by the policy's quality floor plus the remaining
quality weight. The resulting score is capped at 100, converted to integer XP
using the policy's maximum, and mapped to D- through S+ by its score bands.
Draws and losses can earn smaller learning credit. Exact constants and grade
boundaries remain authoritative in the policy YAML.

## Collection and replay

One contribution at the final actual ply stores the entire endgame's XP, one
grade, starting ply/evaluation, outcome, move-quality evidence, and rule/analysis
versions. **Collect rewards** saves it. Recollection preserves the original award
through reanalysis, tuning changes, and cache eviction. Changing the selected
color replaces that game's award rather than collecting both sides.

The track has independent XP and high-grade counts. It initially reuses the
existing [level curve and grade gates](tactical-masteries.md#shared-progression),
without using tactical occurrence scoring. One game can supply only one high-grade
mark to this track. Forks, skewers, and openings cannot satisfy its grade gates.

The review reward panel previews the grade, starting advantage, result, move
count, and quality. Its **Replay endgame** button and collected contribution jump
to the starting position. XP appears in replay totals only at the finished-game
ply. English and German labels are available. **Pawn endgame example** loads a
[synthetic game](../../web/src/fixtures/games/pawn-vs-pawn.pgn) with promotions and
an actual checkmate; it is a local demonstration, not the author's historical game.

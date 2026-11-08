# Opening masteries

These rules serve the game designer and implementers. Jobava London is the first
implemented opening family. Its numeric balance values are prototype tuning in
[the opening policy](../../data/rules/opening-mastery.yml), not conventional chess
grades or immutable game-design thresholds.

## Named openings and branching

Only genuinely named openings and named variations receive mastery identities.
Move-only descriptions such as a Najdorf Bc4 continuation do not create another
mastery. Raw database labels require grouping and review before activation.

Recognize opening positions through legal replay, including transpositions.
Do not infer a strict tree from ECO codes, name prefixes, or move order: named
positions can have several routes. Lichess calls Jobava London the Rapport-Jobava
System; its “with e6” entry belongs to the same mastery. The route can pass named
Chigorin or Indian positions; that does not activate another mastery now.

Each opening family has independent White and Black mastery tracks. Facing an
opening as Black is a different skill from playing it as White. Preserve the
existing Jobava names, The Modern Artist and The Art Critic, and stable IDs.
Queen's Pawn and other opening families remain future work. Broad parents will
need substantially more XP than narrower variations because they occur more
often. Parent/child credit rules remain unresolved until those tracks are added.

## Theory and independent play

A confirmed book move under the
[shared definition](../../docs/reference/opening-masteries.md#shared-book-move-definition)
earns modest participation XP. The definition is separate from mastery scoring
so later refinements apply consistently to both players and every consumer.
The current reference lacks the statistics needed to confirm its candidates;
unverified moves earn no theory XP and do not establish a departure from theory.
Following confirmed theory deeper increases participation, subject to a per-game cap.
Repeated positions cannot farm theory XP. The reference is a bounded sample;
being outside it is not a claim of a theoretical novelty.

The main XP comes from the player's quality of play after either player first
leaves the book. Contributions taper over successive own moves throughout the
game, including the early middlegame. Returning to theory never restarts the
reward window. Recognition of an opening does not require every earlier move to
be in the move book. Missing clocks or analysis leaves opening XP pending.

## Converting an advantage

Knowing the opening should help the player punish mistakes and crush the
opponent in the middlegame. The first precise moves that exploit an advantage
receive extra XP. An evaluation around three pawns is a calibration point on a
continuous spectrum, not a binary cutoff or an eight-turn stability test.

The largest absolute advantage seen determines how quickly the conversion
window is spent. Each own move spends capacity, including poor moves. Early
conversion retains full weight, then rewards fall sharply toward almost nothing.
The bonus requires precise play that retains an actual favorable advantage.

The fade is permanent for that game. Blundering the advantage back, changing
which side is ahead, or punishing a second mistake cannot replenish it. Late
padding must not inflate credited thinking time. Earlier earned XP is retained.
These conversion rules belong to opening mastery; tactical difficulty has its
own [intended follow-up](achievement-families.md#intended-tactical-scoring-follow-up).

## Time, results, and progression

Opening XP reflects both the selected time control and recorded own thinking
time, with caps. Comparable ten-minute games should earn about 2.3 times the XP
of five-minute games. Longer-control scaling is deliberate: mastery should
counterbalance the ease of grinding flat badges through bullet games. Opening
and tactical scoring have separate functions, sharing evidence helpers.

Wins double opening XP, draws retain it, and losses halve it. These modifiers
do not determine the quality grade. Each game can earn one D- through S+ grade
from independent play, requiring at least four credited outside-book moves.
Book-only games still earn participation XP but cannot supply an S-grade mark.

Each color's levels and grade requirements are independent. Levels one through
five use XP alone. Level six needs two S-/S/S+ game marks, level seven needs
three additional marks, and level eight needs five more. XP always accumulates;
marks can be banked. One game's grade satisfies only one gate in its own track.
New policy versions must not silently reprice saved contributions.

## Future catalog automation

Future automation should generate opening recognition data from Lichess, then
apply reviewed naming/grouping rules. Recognition records, source provenance,
scoring policies, and authored writing remain separate so generation preserves
stable IDs and the designer's flavor text. This iteration handcrafts Jobava;
it does not activate or implement a catalog-wide generator.

See the [implementation reference](../../docs/reference/opening-masteries.md)
for current evidence, arithmetic, and source limitations.

# Opening masteries

Jobava London, Queen's Pawn Game, and the named Caro-Kann branches each have
separate White and Black tracks.
The [Jobava catalog](../../data/achievements/masteries/openings/jobava-london.yml)
retains The Modern Artist and The Art Critic; the
[Queen's Pawn catalog](../../data/achievements/masteries/openings/queen-s-pawn-game.yml)
adds the broad family. Both use the shared
[opening scoring policy](../../data/rules/opening-mastery.yml). Its per-opening
threshold multipliers make Queen's Pawn levels require substantially more XP,
with the same independent grade gates and per-game scoring. The
[Caro-Kann catalog](../../data/achievements/masteries/openings/caro-kann-defense.yml)
uses that policy too, preserving The Iron Wall and The Wall Breaker for its root.
Broader Caro-Kann branches have higher threshold multipliers than narrower ones;
these are prototype balance settings in the shared policy.
Tactical mastery currently retains its previous scoring rules. Its top-three
alternative comparison is [intended future work](../../design/mechanics/achievement-families.md#intended-tactical-scoring-follow-up).

## Recognition and book evidence

[Recognition](../../web/src/openings/recognition.ts) matches legally replayed
positions against [curated Jobava entries](../../data/openings/jobava.json),
the [Queen's Pawn entry](../../data/openings/queens-pawn-game.json), and
the [curated Caro-Kann entries](../../data/openings/caro-kann.json).
Standard, Nf6-first, Bf4-first, and e6 setups can reach the same Jobava family.
Queen's Pawn recognizes the position after 1.d4, including every Black response
and subsequent named opening. Recognition returns every matching family, so a
Jobava game starting with 1.d4 earns full XP and one eligible game grade in both
tracks for the played color. Membership follows replayed entry positions, not
an inferred hierarchy; entering a Jobava position by another route does not
automatically establish the Queen's Pawn entry.
Recognition requires a normal starting board. PGN Opening/ECO labels do not
activate a mastery. Jobava's two color tracks retain the earlier draft IDs and names.

Caro-Kann recognition covers every Caro-Kann Defense entry in the pinned Lichess
snapshot. The vendored [source rows](../../data/openings/sources/caro-kann.tsv)
allow offline coverage tests. Duplicate labels share one identity. The two Short
Variation labels share one track pair, and generic Main Line, Exchange Line, and
Retreat Line labels belong to their named parent. Eponymous lines such as Carlsbad,
Czerniak, and Perlis retain their own identities. The recognition catalog records
these reviewed aliases and legal entry positions explicitly.

Each reached named position earns full independent XP and one eligible grade
for its color track; ancestors are not inferred from label prefixes or ECO codes.
For example, the ordinary Short Variation route recognizes Caro-Kann, Advance,
and Short. Transposing through 3.Nc3 or 3.Nd2 can reach the same Classical entry.
Unplayed sibling variations and simulated moves receive no credit.

The [vendored move book](../../data/openings/README.md) is independent of named
opening recognition. Both runtimes embed the same pinned Polyglot bytes and
use the same TypeScript reader. No gameplay request to an online explorer is
needed. Build/test processes do not download data. Run `pnpm book:check` to
verify the checksum and entry ordering.

This book samples one month of 2100 rapid games, requires 25 games at an emitted
position, and ends at 30 plies. Missing coverage means outside this reference.
Castling uses Polyglot's king-to-rook encoding; transpositions are position based.

## Shared book-move definition

The [book-move rule](../../web/src/chess/book-move.ts) is independent of opening
recognition and XP scoring. A move qualifies when it appears in the downloaded
reference, has enough observations of that move, loses fewer than 70% of its
games from the mover's perspective, and is neither a mistake nor a blunder under
the [shared Lichess classifier](../../web/src/chess/quality.ts). Draws remain in
the loss-rate denominator. Inaccuracies do not disqualify a move. The minimum
observation count is provisional tuning in the rule, pending the designer's
choice; the reference's minimum position count does not establish it.

The current Polyglot artifact stores scaled move weights without per-move game
counts or outcomes. We cannot recover those statistics from its weights or
provenance. Otherwise eligible moves are annotated as unverified book candidates
until a reference with those statistics is available. They establish neither
theory XP nor a departure from theory. Known failures of frequency, loss rate,
or engine quality are outside the book.

[Move annotations](../../web/src/chess/annotations.ts) cover both players,
independently of the selected profile side, named-opening recognition, or clocks.
Analysis checkpoints and JSON exports include the quality judgment, book status,
reason, and rule/reference versions. Reload and resume derive annotations from
saved engine scores without repeating engine searches. The local server also
derives annotations when accepting analysis. Replay labels distinguish confirmed
book moves from unverified candidates. Simulated continuations are excluded.

## Award calculation

[Opening assessment](../../web/src/openings/mastery.ts) needs complete, matching
current analysis and usable clocks. It does not finalize partial rewards. Move
quality uses mover-relative scores and an opening-specific copy of the initial
quality bands. Mate outcomes remain categorical. Actual checkmate qualifies.

Confirmed book moves earn depth-increasing participation XP, capped for
the whole game. Repeated positions add no participation or independent-play XP.
After either player first leaves the book, successive own moves advance the
independent-play decay, including moves that return to theory. Earlier moves
can receive retrospective book credit once the completed game is recognized.

The conversion signal grows linearly between the policy's lower advantage and
full-strength advantage. A running peak of absolute evaluation makes this signal
irreversible; forced mates use full strength without inventing a CP distance.
Each own move spends capacity. The first capacity units retain full weight;
subsequent weights fall exponentially to a small floor. Good early conversion
can earn a bonus while the actual favorable advantage is retained. Every later
opening award receives the fade, and evaluation swings never reset it.

The awarded amount combines theory, independent play and conversion bonus,
then applies reward weight, time and result multipliers. The bonus itself also
fades. Integer XP is rounded once per game and track and allocated to moves by
largest fractional remainder, breaking ties by earlier ply. Any positive total
has a minimum of one XP; individual moves can receive zero.

## Time and outcomes

[Clock calculation](../../web/src/openings/time.ts) parses initial seconds and
increment from TimeControl. Each side's first sample is an anchor, since first
move clock behavior varies by platform. Subsequent deltas add the increment
before subtracting the remaining clock. Missing/invalid samples or unexplained
clock increases leave awards pending. Minor rounding discrepancies are tolerated.
The opponent waiting does not increase credited own thinking time.

The nominal control is initial seconds plus forty increments. Its capped
power curve deliberately favors longer games; a thinking-time factor reflects
the player's clock use. Per-move time is capped. Conversion fade discounts
credited time, reaching zero at the reward floor. Formula constants live in
[source](../../web/src/openings/time.ts) and the policy. Comparable 10+0 versus
5+0 games have an approximately 2.3:1 time multiplier ratio.

Wins multiply opening XP by two; draws by one; losses by one half. Neither time
nor result modifiers affect grades. Lichess imports use API centiseconds,
normalized to seconds; Chess.com imports normalize PGN clock annotations.
Checking games again can recover missing clock evidence without duplicating a
game or repricing an already collected opening award. Platform errors remain
visible through the existing import report; no clock duration is fabricated.

## Grades, collection, and replay

The game grade uses independent-play CP loss weighted by decay and fade. Errors
remain included even when they earn no XP. Four credited moves outside the book
are required, and moves at the fade floor do not count toward that minimum.
Rejected mate transitions force D- once the minimum is met. Accepted mate
outcomes add no CP loss. Book participation cannot supply a grade.

One contribution per game carries the grade. Saved move contributions retain
rule, grade, analysis, book and recognition versions, their side and the XP
breakdown. Grade-gate batches are independent by track, following the
[common level rules](tactical-masteries.md#shared-progression). Recollection
retains the complete saved opening award, including its single grade, rather
than adding newly repriced move fragments. Recollecting older Jobava games with
analysis and clocks can add the newly available Queen's Pawn award while leaving
their saved Jobava awards intact. Color correction replaces the awards.

Collection cards group contributions by game. Open a game to inspect book,
independent-play, bonus, reward-weight and time/result evidence; replay buttons
jump to the contributing moves. Saved awards survive analysis-cache eviction.
English and German interfaces, Help, and the clocked synthetic **Jobava example**
and **Caro-Kann example** are available in Notebook. The examples are not the
author's historical games. Mastery search accepts English and translated names,
and the collection pages through the catalog. Replay lists only tracks with
contributions in that game, including their zero totals before the award move.

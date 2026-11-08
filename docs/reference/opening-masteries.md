# Opening masteries

Jobava London has separate White and Black tracks: The Modern Artist and The
Art Critic. Their [catalog](../../data/achievements/masteries/openings/jobava-london.yml)
references an independent [opening scoring policy](../../data/rules/opening-mastery.yml).
Tactical mastery currently retains its previous scoring rules. Its top-three
alternative comparison is [intended future work](../../design/mechanics/achievement-families.md#intended-tactical-scoring-follow-up).

## Recognition and book evidence

[Recognition](../../web/src/openings/recognition.ts) matches legally replayed
positions against [curated Jobava entries](../../data/openings/jobava.json).
Standard, Nf6-first, Bf4-first, and e6 setups can reach the same family.
Recognition requires a normal starting board. PGN Opening/ECO labels do not
activate it. The two color tracks retain the earlier draft IDs and names.

The [vendored move book](../../data/openings/README.md) is independent of named
opening recognition. Both runtimes embed the same pinned Polyglot bytes and
use the same TypeScript reader. No gameplay request to an online explorer is
needed. Build/test processes do not download data. Run `pnpm book:check` to
verify the checksum and entry ordering.

This book samples one month of 2100 rapid games, requires 25 games at an emitted
position, and ends at 30 plies. Missing coverage means outside this reference.
Book membership alone never proves sound play: the opening policy's engine
quality gate also applies. Castling uses Polyglot's king-to-rook encoding;
transpositions are position based.

## Award calculation

[Opening assessment](../../web/src/openings/mastery.ts) needs complete, matching
current analysis and usable clocks. It does not finalize partial rewards. Move
quality uses mover-relative scores and an opening-specific copy of the initial
quality bands. Mate outcomes remain categorical. Actual checkmate qualifies.

Engine-approved book moves earn depth-increasing participation XP, capped for
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
than adding newly repriced move fragments. Color correction replaces the award.

Collection cards group contributions by game. Open a game to inspect book,
independent-play, bonus, reward-weight and time/result evidence; replay buttons
jump to the contributing moves. Saved awards survive analysis-cache eviction.
English and German interfaces, Help, and the clocked synthetic **Jobava example**
are available in Notebook. The example is not the author's historical game.

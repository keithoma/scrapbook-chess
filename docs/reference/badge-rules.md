# Badge qualification

All definitions under [badges](../../data/achievements/badges/) are active.
The [catalog](../../web/src/achievements/catalog.ts) selects their executable
rules. Every badge has a name, category, subcategory, base flavor, and flavor for
every tier. Existing IDs, tier amounts, and nonempty authored writing are retained.
New text completes formerly blank entries.

Badges count repeatable accomplishments. Tactical mastery still awards quality-based
experience; the badge quality classifier does not replace its authored XP bands.
Engine continuations never count as actual game moves for badges.

For factual move events, ratings, speed categories, and opposite-side castling,
see [the browser reference](browser-proof.md#active-board-event-badges).

## Calendar rewards

Weekday, time-of-day, weekday-win, and weekend-win badges use the original game
start timestamp in the time zone saved in **Settings**. Four-hour blocks are
half-open: midnight belongs to 00–04, 04:00 belongs to 04–08, and so on. Weekends
are Saturday and Sunday. Daylight-saving conversion uses the IANA zone rules.

Profile imports use the platform start timestamp. Guest PGNs need an explicit UTC
date/time or supported UTC-tagged start; ambiguous local dates are not guessed.
Missing timestamps or invalid zones give no calendar credit. Other rewards remain
available. The first collection snapshots the zone for that game; later settings
changes and recollection preserve it. Guest settings are stored on the device;
profile settings are stored with the local profile.

## Phase wins

Preparation, Tactician, and Squeezing Stone use the TypeScript port of
[Lichess scalachess Divider](https://github.com/lichess-org/scalachess/blob/736daea6b3fc3dddebbc69f3bd8463dc13cc198a/core/src/main/scala/Divider.scala).
It determines boundaries from material, back-rank development, and piece
mixedness. It does not use a fixed opening move count or an engine evaluation.

The input is each actual move's before-board, matching the upstream tests. The
last actual move's before-board determines the finishing phase. A game may have
no middlegame boundary or start directly in an endgame from a test FEN. A win
contributes once at game end. The same division supplies comeback boundaries.
The [port](../../web/src/achievements/phases.ts) pins the source revision; its
MIT permission notice ships in [the public assets](../../web/public/licenses/scalachess-MIT.txt).

## Fianchetto development

Flank Sniper counts an original home bishop's first development onto b2/g2 for
White or b7/g7 for Black, behind an advanced friendly pawn on that flank file.
Each home bishop can count once. A captured bishop, later shuffle, redeveloped
bishop, or unrelated bishop arriving on the square does not create another event.
No engine analysis or win is required.

## Clock wins

Lightening requires a win and a strictly greater remaining clock at every sample
after both colors have moved. Initial equal clocks are excluded; later equality
fails. Clutch requires a win and at least one such sample where both clocks are
at or below its configured limit. The limit lives in
[Chessdom YAML](../../data/achievements/badges/domination/chessdom.yml).

Comparisons use actual remaining clocks, including increment already applied by
the source, rather than estimated thinking time. Lichess API centiseconds are
normalized to seconds; chess.com and guest PGNs use `%clk` comments. Every actual
move must have a valid clock. Missing clocks do not count as zero or prove a lead.
These sampling and duration choices are prototype tuning rules.

## Analysis and move quality

Evaluation badges need matching analysis for the loaded PGN and current analysis
version. Precision, comeback, draw recovery, and punishment require all actual
plies analyzed. Clean gains require the capture analyzed and the subsequent
actual observation window present. Collect factual rewards first, analyze, then
collect again to add qualifying evaluation awards.

Mistakes and blunders follow the winning-chance and mate-transition conventions
in the pinned [Lichess Advice implementation](https://github.com/lichess-org/lila/blob/7245313a7b6fb39491e2c2c172cecfea268fc72d/modules/tree/src/main/Advice.scala).
The local [quality classifier](../../web/src/achievements/quality.ts) independently
implements those numerical rules. Inaccuracies are deliberately ignored.
A fixed centipawn loss is not the general mistake/blunder test. Actual checkmate
is a clean winning move. Missing analysis never proves clean play.

Scores are stored from White's perspective and converted to the relevant player's
perspective for classification. Forced mates retain their winning/losing meaning;
mate distances are not arbitrary centipawn values. These are depth-six browser
engine judgments, not claims of perfect tactical truth.

## Precision wins

- Adult Supervision requires a win without a player blunder. Mistakes are allowed.
- Terms of Perfection requires a win without a player mistake or blunder.
  Inaccuracies are allowed.
- Always on Brand preserves the original asymmetric condition: every analyzed
  after-move position must be strictly above 0.00 for White or strictly below
  +0.50 from White's perspective for Black. The initial unplayed position is
  excluded. A winning mate qualifies; a losing mate does not.

Opponent errors do not disqualify the first two badges. Each qualifying game
contributes once at its final actual ply.

## Clean material gains

Each clean-material badge counts actual captures of its named role. The capturing
move must be neither a mistake nor a blunder. From that capture onward, the net
captured material gain must remain at least the captured role's full value for
ten subsequent actual plies, interpreted as five full turns. Promotions alone do
not create a captured gain.

Values are pawn 1, knight/bishop 3, rook 5, and queen 9. The running balance adds
player captures and subtracts opponent captures within the window. Fair trades,
queen-for-rook exchanges, and material returned during the window fail the full
role-value requirement. A game ending before confirmation gives no credit;
virtual continuations do not fill the window.

The event appears at confirmation, with the original capture ply and retained
gain saved as evidence. Each qualifying capture is a separate occurrence. This
bounded observation rule is an implementation choice, not a general solver for
sacrifices or compensation. Its configurable window is in
[clean-gains YAML](../../data/achievements/badges/material/clean-gains.yml).

## Comebacks

The [four authored conditions](../../data/achievements/badges/resilience/comebacks.yml)
sample player-relative evaluation at Lichess phase boundaries:

| Badge | Condition |
| --- | --- |
| The Long Con | Win after being at least 1.50 down at both the middlegame and endgame starts. |
| Speedrun the Apology | Win within 40 plies of the middlegame start, having been at least 2.00 down there. |
| Plot Armor | Win after being at least 3.00 down at the middlegame start. |
| Unfinished Business | Win or draw after being at least 2.00 down at the endgame start. |

Deficits are inclusive, point-in-time samples; they need not persist for another
window. A missing phase boundary does not qualify. A forced losing mate counts
as a deficit. Events confirm at game end and retain the originating boundary.
The sampling and 20-full-move window interpretation are prototype choices.

## Draw recovery

The four Great Escapes badges require an actual draw, their specific ending,
and an earlier player evaluation at or below the configured `lost_cp`, or a
forced losing mate. The initial implementation uses one prior position rather
than a sustained deficit. The threshold is an explicit tuning value in
[Great Escapes YAML](../../data/achievements/badges/resilience/great-escapes.yml),
not a Lichess mistake/blunder threshold.

Chess.com result codes establish agreement, repetition, fifty-move, or
insufficient-material endings, including timeout against insufficient material.
Explicit PGN termination text or a final result comment can also identify an
ending for guest games. When the source provides no specific reason, actual
terminal board/history proof can establish stalemate, insufficient material,
a fifty-move position, or threefold repetition. Position identity includes side
to move, castling rights, and legal en-passant rights.

A merely claimable draw in an unfinished game is insufficient. Stalemate is not
one of these four badges. Generic `Normal` PGN termination and Lichess `draw`
status do not establish agreement: Lichess collapses several reasons into that
status. Unknown reasons skip the affected badge. Source reasons are retained
with imported and collected games; client-supplied reward/reason claims do not
override imported evidence.

## Punishing errors

Customer Feedback counts opponent mistakes; Find Out counts opponent blunders.
The categories are exclusive. The player must make an immediate actual reply,
classified as neither a mistake nor blunder, retaining the gifted advantage
within the configured winning-chance slack. No reply means no exploitation
credit, even if the opponent resigns.

The initial slack is one win-probability percentage point, represented as 0.02
on Lichess's −1 to +1 chance scale. This is a configurable prototype choice in
[punishment YAML](../../data/achievements/badges/domination/punishment.yml).
The reply confirms the event; the opponent error is its origin. A win is not
required by the authored descriptions.

## Saved progress and replay

Repeated collection replaces a game's grant and does not add its progress again.
For the same selected color, previously collected analysis awards keep their
saved evidence through checkpoint eviction, partial reanalysis, or tuning
changes. Color correction replaces them. Factual badges are recomputed so old
games can gain newly activated awards on explicit recollection. A future bulk
recalculation/migration policy remains undecided.

Replay shows progress at the confirmation ply. Where a badge needs a sequence,
its origin is also available for replay. The local server and guest notebook use
the same detectors. The browser remains trusted for engine evidence in this
personal development release; proper authentication and verification are deferred.

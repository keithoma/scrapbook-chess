# Run the browser proof for the first time

This tutorial takes a contributor from a checkout to a locally analyzed game.
You will prepare a sample game, replay it, and restore saved analysis after reloading.
Guest examples need no chess-platform account. The local server creates its SQLite
database automatically; Stockfish runs in the browser.

## Start the app

Install pnpm using its [official installation guide](https://pnpm.io/installation).
The root package file pins the workspace’s package manager and declares its
Node runtime. pnpm downloads the declared runtime when needed and uses it for
package scripts.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Local URL printed by Vite. The root command starts the API and browser
app together. The scripts prepare the engine files from the
pinned dependency and download the pinned SVG pieces on first use; generated assets are not committed. Stop the development
server with Ctrl+C when you finish.

For your own games, follow [the mock-profile import guide](../how-to/import-games.md).
The guest notebook below remains available when signed out.

## Replay and analyze a game

Home contains game importing and games awaiting review. Open **Game review** to
prepare the supplied recent rapid game with Black selected, or expand **Import a
PGN or try an example** to load another game. The earlier 137-ply benchmark is
available as **Original rapid game**. **History** lists imported games and local
PGNs with their analysis status.

Choose your side under **I played as**, then select **Analyze this game**. On
first use, the browser downloads the full engine. See
[configuration and storage](../reference/browser-proof.md) for download size and
caching behavior. Keep this browser open while it works. You can navigate between
screens during analysis; replay and reward collection remain locked until analysis
and achievement preparation finish.

Once some moves are saved, click **Pause analysis**, then reload. The app restores
the checkpoint. Choose your side again if it was not yet collected, then select
**Resume analysis**. Once preparation finishes, use the next/previous controls,
slider, move list, or autoplay to navigate the game.

## Explore a simulated ending

Open **Import a PGN or try an example** and select **Mate example**. Choose
Black and analyze it. The separate engine continuation should end with Black playing `Qh4#`.
Click its move to see that position, then navigate the played moves to return to
the actual game. The simulation never extends the original played line.

You can paste one standard-chess PGN and select **Load PGN**, or select
**Export analysis JSON** to save the current analysis outside browser storage.

## Inspect a possible knight fork

Choose **Your recent game (Black)** from the PGN panel. In **Knight-fork
candidates**, after analysis finishes, select **15… Nxe3**. The replay jumps to the position and highlights
the knight and attacked pieces. This example also shows that White can capture
the knight immediately; a geometric fork alone does not establish an award.

The panel shows best-versus-played engine evidence from completed analysis. Switch the player color to
inspect the other side. This particular candidate earns no mastery XP because
White can capture the knight without allowing a profitable recapture.

To try a qualifying fork, open **Fork example** and select White under **I played
as**. Analyze the game, select **1. Nf7+**, then select **Collect rewards**. Open
**Achievements** to see the **Knight forks** mastery, its XP, level, and progress
to the next level. Expand the contribution and select **Replay fork** to revisit
the evidence. This example is a synthetic completed PGN for local testing.

Higher-quality moves earn larger XP awards according to the mastery YAML. Analysis
must be available before quality-dependent XP can be collected. Recollecting the
same game keeps earned XP stable and does not count the same move twice.

In development, each selected fork or skewer also offers **Should earn XP** and
**Should earn 0 XP**. Click either to save your judgment as a repository fixture
for future regression tests. Revisiting the candidate restores your choice;
clicking the other option replaces it. See
[development review fixtures](../reference/tactical-masteries.md#development-review-fixtures)
for the file location and how disagreements become failing tests.

## Try an endgame mastery

Choose **Pawn endgame example**, select White, and analyze the game. The reward
panel previews **Pawn vs Pawn**, including the initial advantage, result, move
quality, grade, and XP. Collect the reward and open its mastery card in
**Achievements**. **Replay endgame** returns to the first position where both
sides have only kings and pawns. Promotions and the actual finish remain part
of the performance. See [endgame scoring](../reference/endgame-masteries.md) for
how conversions, equal starts, and comebacks differ.

## Collect your first rewards

Load a completed game PGN and choose your side using **I played as**. You can
decide after seeing which color you played; no color is assumed for the next
game. Complete preparation, select **Collect rewards**, then open **Achievements**
to see badges and mating scraps. Basic badge rules and actual checkmates do not
use engine evaluations, but the review UI requires complete analysis before collection.
The [badge reference](../reference/browser-proof.md#active-board-event-badges)
explains which game events count. If you saved games before a badge was activated,
open each game and collect again to add its new contributions without duplicates.

The mate example above has an unfinished result, so it demonstrates analysis
without being collectible. Use a completed PGN for collection. The local stage
is for testing and does not verify platform eligibility or a signup cutoff.

Move through the replay to see contributions at individual moves. Open a mating
scrap to see its real checkmate counts by color and jump to the contributing game.
A virtual scrap has a different appearance and upgrades when you collect its real
counterpart. Recollecting a game does not duplicate progress; choosing another
color and collecting again corrects that game's rewards.

Previously collected basic rewards can be expanded by preparing and collecting
the game again. Played-move progress is not counted twice.

Guest analysis and rewards stay in this browser; development review fixtures are
saved in the checkout. Continue with [running checks](../how-to/run-checks.md)
if you are changing the app, or [browser analysis](../explanation/browser-analysis.md)
to understand its implementation.

# Run the browser proof for the first time

This tutorial takes a contributor from a checkout to a locally analyzed game.
You will replay a sample game, pause analysis, and restore it after reloading.
No chess-platform account, database, or server engine is required.

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

Open the Local URL printed by Vite. The scripts prepare the engine files from the
pinned dependency; generated binaries are not committed. Stop the development
server with Ctrl+C when you finish.

## Replay and analyze a game

The initial board contains the supplied recent rapid game with Black selected.
Use the next/previous controls, slider, or move list to navigate. The earlier
137-ply benchmark remains available as **Original rapid game** under the PGN panel.

Click **Analyze this game**. On first use, the browser downloads the full engine.
See [configuration and storage](../reference/browser-proof.md) for the download
size and caching behavior. Keep the page open while it works. You can continue
moving through the board during analysis.

Once some moves are saved, click **Pause analysis**, then reload. The app restores
the checkpoint. Click **Resume analysis** to finish the remaining work.

## Explore a simulated ending

Open **Open another page of the notebook** and select **Mate example**. Analyze
it. The separate engine continuation should end with Black playing `Qh4#`.
Click its move to see that position, then navigate the played moves to return to
the actual game. The simulation never extends the original played line.

You can paste one standard-chess PGN and select **Load PGN**, or select
**Export analysis JSON** to save the current analysis outside browser storage.

## Collect your first rewards

Load a completed game PGN and choose your side using **I played as**. You can
decide after seeing which color you played; no color is assumed for the next
game. Select **Collect rewards**, then open **Collection** to see badges and
mating scraps. Basic badges and actual checkmates do not require Stockfish.

The mate example above has an unfinished result, so it demonstrates analysis
without being collectible. Use a completed PGN for collection. The local stage
is for testing and does not verify platform eligibility or a signup cutoff.

Move through the replay to see contributions at individual moves. Open a mating
scrap to see its real checkmate counts by color and jump to the contributing game.
A virtual scrap has a different appearance and upgrades when you collect its real
counterpart. Recollecting a game does not duplicate progress; choosing another
color and collecting again corrects that game's rewards.

If you collect basic rewards before analysis finishes, select **Collect rewards**
again afterward to save any newly found virtual scrap. Played-move progress is
not counted again.

Everything stays in this browser. Continue with [running checks](../how-to/run-checks.md)
if you are changing the app, or [browser analysis](../explanation/browser-analysis.md)
to understand its implementation.

# Import games with the local mock profile

Use this guide to test the play, import, analyze, and collect loop. This stage
uses a local mock login. Proper authentication and platform ownership
verification are deferred.

## Enable the development profile

From the repository root, create `.env` from `.env.example` if you do not already
have one. Set:

```dotenv
SCRAPBOOK_MOCK_LOGIN=1
SCRAPBOOK_MOCK_LICHESS_USERNAME=noctu2nality
SCRAPBOOK_MOCK_PROFILE_AGE_HOURS=8
```

Run `pnpm dev` and open the URL printed by Vite. The root command starts both
the browser app and the local API. If you were running the earlier browser-only
command, stop it and restart with the root command.

Open **Profile** and select **Use local mock login**. The server creates the
profile once, backdates its collection start by the configured hours, and links
the configured Lichess account. That timestamp stays fixed across logins and
restarts. Changing the age setting does not redate an existing profile.

The supplied account is for the author's local testing. Set your own Lichess
username when testing a different account. Mock login is forbidden in production.

## Choose your time zone

Open **Settings** and save your IANA time zone, such as `Europe/Berlin`. Calendar
badges use the original game start timestamp converted into that zone, including
daylight saving time. Profile preferences persist on the local server; signed-out
guest preferences stay on this device. Already collected games retain their saved
time zone when preferences change or the game is collected again.

## Check for new games

Select **Check for new games**. To include chess.com, add its username under
**Linked accounts** first. The two accounts share the profile's collection.

The server imports completed, rated, live standard-chess games started on or after
the profile's collection date. Bot/AI games, correspondence/daily games, unsupported
variants, missing required metadata, and illegal PGNs do not qualify. Check results
show imported counts, skipped records, and separate platform errors.

Chess.com may publish games later because of its public API cache. Check again
later if a recent game is missing. The importer revisits eligible monthly archives
instead of advancing a cursor past games that have not appeared yet. Retries and
overlapping checks do not create duplicate games. Rechecking also fills missing
clock evidence when the platform supplies it.

## Analyze and collect

Select **Open game** beside an imported game. Your color comes from the linked
account. Select **Analyze this game**, then **Collect rewards**. Browser Stockfish
does the analysis; the server saves completed analysis and recomputes contributions
from the imported game using the shared reward rules.

You can collect the [board-event badges](../reference/browser-proof.md#active-board-event-badges)
before analysis. Analyze and collect again to add qualified mastery XP or a
virtual scrap. Evaluation-based [badges](../reference/badge-rules.md) require
analysis as described by their individual rules. Recollect previously saved games
to add newly activated badges;
existing progress is not counted twice.

[Jobava opening mastery](../reference/opening-masteries.md) requires complete
analysis and usable clocks. If clock evidence is missing, check games again and
reopen the imported game before collecting. Clockless guest PGNs can still be
replayed and analyzed, but their opening XP stays pending.

Open **Collection** to see your profile rewards. Another browser connected to the
same local server and mock account can restore them, including saved analysis.
This does not make the development server publicly accessible.

The signed-out guest notebook has separate browser-local rewards. Uploaded test
PGNs and guest totals are not silently copied into the profile. Sign out to return
to guest testing.

## Test multiple accounts from one platform

Set `SCRAPBOOK_ALLOW_MULTIPLE_ACCOUNTS=1` in `.env` and restart the development
server. This override is server-side and forbidden in production. A game shared
by two linked accounts is stored once; the first imported account determines its
player color. Unlinking an account stops future imports but retains saved games
and rewards.

See [local server configuration](../reference/local-server.md) for storage,
environment settings, API boundaries, and verification limits.

# Product experience

These are intended product rules for the game designer and implementers. They
include planned behavior, not a claim that the browser proof implements it.

## Product and release

- Scrapbook; Chess is a playful, polished achievement companion for chess,
  inspired by League of Legends Challenges and Cookie Clicker.
- The flavor writing is central to the rewards. Frequent progress and discoveries
  should make checking after a game satisfying, including after losses.
- Achievements should celebrate normal play. Avoid encouraging in-game hunting
  or bad moves for progress. The author decides visibility and quality criteria.
- The eventual destination is a public hosted app. The first release may serve
  only the author, but must support desktop and phone.
- Prefer free hosting; €5–10/month is acceptable when useful. Budget must not
  become a reason to sacrifice product quality.
- Initial flow: play on a chess platform → visit Scrapbook → manually check for
  new games → collect rewards → replay contributing moments → browse collection.
- Automatic polling is deferred. The exact collection layout and visual direction
  remain proposals: a tactile scrapbook with dramatic reward effects.

## Languages and player support

- Support English and German from the beginning, including interface and help
  navigation. Players can choose their language explicitly.
- Keep localization separate from chess notation, rule identifiers, and authored
  content. Preserve the original flavor writing. How to handle untranslated
  achievement writing remains a design decision.

## Accounts, imports, and eligibility

- Support Lichess and chess.com, contributing to one shared collection.
- Record each game's platform and linked account in history.
- Collection eligibility begins at Scrapbook profile creation, not historical play.
- Separate Scrapbook accounts are the working direction; the exact sign-in method
  and platform ownership verification are not selected.
- Production permits one linked account per platform per profile.
- Local development permits multiple accounts from one platform through an
  explicit server-side development flag. Production must reject that flag.
- Working eligibility: completed standard-chess, rated games against humans.
  Rated-only was expressed tentatively; retain it as the initial default to review.
- Catalog categories are ultrabullet, hyperbullet, bullet, blitz, rapid, classical.
  Their exact cross-platform time-control mapping is still open.
- Preserve original source data needed for clocks, termination, moves, and dates.
- Importing and retrying a game must not duplicate progress, including when two
  linked development accounts participated in the same game.
- Chess.com public-data freshness may delay availability. Do not promise immediate
  post-game availability before testing the integration.

## Replay and rewards

- Replay the game with achievement progress attached to contributing moves.
- Game-level contributions appear at the end. Allow jumping between achievement
  moments. Record enough evidence to explain the contribution later.
- A condition can require later confirmation: a clean capture held for five turns
  is associated with the capture but must not be awarded before it qualifies.
- Save actual contribution amounts, not only a list of ply numbers.
- Reward pacing, batching, sound, and animation treatments remain design work.

See [achievement families](../mechanics/achievement-families.md),
[checkmate scraps](../mechanics/checkmate-scraps.md), and the
[implementation map](../planning/achievement-implementation.md).

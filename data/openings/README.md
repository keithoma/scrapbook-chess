# Opening reference data

The Polyglot book and its original JSON provenance come from the
[May 2026 release](https://github.com/Dash1971/chess-opening-book-builder/releases/tag/books-2026-05-v1).
The publisher distributes generated books under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), matching the
[Lichess archive](https://database.lichess.org/) used to build them.

[book.json](book.json) pins the source, checksum, and version. Run
`pnpm book:check` to verify the vendored bytes. No download occurs during builds,
tests, or gameplay. The book samples 2100 rapid games from one month, requires 25
games per emitted position, and stops at 30 plies. Absence means outside this
reference, not a claim of theoretical novelty. The publisher's
[builder](https://github.com/Dash1971/chess-opening-book-builder/blob/main/book_builder.py)
scales weights per position and writes no move counts or outcomes. Membership
therefore supplies candidate evidence for the
[shared book-move definition](../../docs/reference/opening-masteries.md#shared-book-move-definition),
not proof that its frequency and loss-rate gates pass.

[jobava.json](jobava.json) handcrafts recognition from the
[Lichess opening names](https://github.com/lichess-org/chess-openings/tree/3ba6b20d31b2e6125cb0e6a2e792f400717d9d39),
also CC0. It folds move-only continuations into one identity. Future generation
can replace recognition data while retaining authored mastery IDs and writing.

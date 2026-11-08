# Contributing

Follow the [local development tutorial](docs/tutorials/local-development.md), then
run the [checks relevant to your change](docs/how-to/run-checks.md). The browser
proof uses npm. The Python prototype uses uv; it has separate dependencies.

## Branches and pull requests

`develop` is the default integration branch. Start topic branches from it and
open pull requests against `develop`, unless a task explicitly targets another
branch. Use focused names such as `feat/browser-replay` or `docs/game-design`.

Keep `main` as a separate branch. Merging a pull request into `develop` does not
update `main` or deploy the application. Changes to `main` are a separate action.

Organize changes into atomic commits that each address one coherent concern.
Use a merge commit when merging a series whose individual commits should remain
visible, rather than squashing that series into a single commit.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): short description
```

The scope is optional. Use `feat` for new functionality and `fix` for bug fixes.
Other useful types include `docs`, `refactor`, `test`, `perf`, `build`, `ci`, and
`chore`. Scopes should identify the affected area, such as `analysis`, `replay`,
`achievements`, or `design`.

```text
feat(achievements): add knight fork mastery
fix(replay): preserve the played line during simulation
docs(design): clarify virtual scrap upgrades
```

Mark a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer.
Separate an optional explanatory body and footers with blank lines. Use `Refs:`
or `Closes:` for related issues.

Enable the repository's optional [commit template](.gitmessage) locally:

```sh
git config --local commit.template .gitmessage
```

Keep changes focused and explain their behavior and relevant validation in the
pull request. Git history and pull requests record implementation work.

## Documentation and game design

Follow the [documentation guide](docs/how-to/write-documentation.md). Describe
implemented behavior under `docs/`; keep intended mechanics, authored ideas, and
the requested implementation map under `design/`. Update local links whenever
files move. Keep the root README as a short entry point.

For agent-specific rules, see [AGENTS.md](AGENTS.md).

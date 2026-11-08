# Run the relevant checks

Run the checks that exercise your change. The root, server, and browser app are
workspace packages; no dependency installation is needed for documentation checks.

## Documentation

From the repository root:

```sh
pnpm docs:check
```

This checks Markdown under `docs/` and `design/`, their file-size limit, and local
inline links. It also checks links in the root entry documents and subtree README
files. It does not fetch external URLs or read the private root scratchpad.

## Browser app

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm test
pnpm build
pnpm test:browser
```

The tests cover server imports/storage and browser chess rules. The build checks
TypeScript in both packages and prepares the server bundle and browser assets. Browser tests
require that build and installed Google Chrome; the
[Playwright configuration](../../web/playwright.config.ts) selects Chrome and
starts a browser preview plus an isolated API fixture server. Both shut down after
the run. Fixtures and reset controls belong only to the test server. No live API
request or alteration of the developer's SQLite database is needed by these tests.

Playwright writes screenshots, traces on failure, and measurement attachments to
ignored `web/test-results/`. The mobile project uses touch/viewport emulation;
its long analysis test also configures CPU throttling. It does not replace
physical Android/iPhone and Safari testing.

Use [the QA policy](../qa/README.md) when recording a formal finding or verification.

## YAML content

Run `pnpm yaml:check` to check source YAML layout and formatting. Use
`pnpm yaml:format` to apply the repository's field order and Prettier formatting.
The commands cover achievement YAML under `data/` and the workspace configuration;
pnpm owns the generated lockfile's format.

Achievement fields put identity and descriptive text before filters and rules.
Tier fields use name, amount, and flavor order. Lists retain their authored order,
including tiers, filters, and mastery awards. The formatter rejects changes to
parsed values. Every YAML achievement must have a category and subcategory. Its
path is `data/achievements/<family>/<category>/<subcategory>.yml`, with lowercase
kebab-case folder and file names. Families are `badges` and `masteries`. The
checker rejects missing categories, mismatched paths, and duplicate IDs across
the YAML catalog. Group by the achievement's game-design subject, not the kind
of data needed to detect it.

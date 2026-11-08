# Run the relevant checks

Run the checks that exercise your change. The root and browser app have separate
package files; no root dependency installation is needed for documentation checks.

## Documentation

From the repository root:

```sh
npm run docs:check
```

This checks Markdown under `docs/` and `design/`, their file-size limit, and local
inline links. It also checks links in the root entry documents and subtree README
files. It does not fetch external URLs or read the private root scratchpad.

## Browser app

From `web/`, after installing dependencies:

```sh
npm test
npm run build
npm run test:browser
```

The build checks TypeScript and prepares the production assets. Browser tests
require that build and installed Google Chrome; the
[Playwright configuration](../../web/playwright.config.ts) selects Chrome and
starts a local preview server. It shuts down the server after the run.

Playwright writes screenshots, traces on failure, and measurement attachments to
ignored `web/test-results/`. The mobile project uses touch/viewport emulation;
its long analysis test also configures CPU throttling. It does not replace
physical Android/iPhone and Safari testing.

Use [the QA policy](../qa/README.md) when recording a formal finding or verification.

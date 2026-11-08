# Write and organize documentation

Use this guide when changing documentation for contributors or game designers.
Update prose when a workflow, operational procedure, public interface, or durable
architectural constraint changes. Keep temporary notes in chat, an issue, a pull
request, or ignored `.superpowers/`.

## Choose a home and reader

Keep the root README to a brief introduction and entry links. Put technical
documentation in `docs/`, using the [Diátaxis framework](https://diataxis.fr/):

| Directory | Reader's need |
| --- | --- |
| `tutorials/` | Learn by following a guided exercise. |
| `how-to/` | Complete a specific task. |
| `reference/` | Look up configuration, interfaces, or other facts. |
| `explanation/` | Understand architecture and tradeoffs. |

Keep dated verification and audit evidence in [docs/qa/](../qa/README.md).
Game-design material uses its own [subject-based structure](../../design/README.md):
`product/`, `mechanics/`, `content/`, and `planning/`. Do not force a narrative
episode or flavor-writing notebook into a technical documentation category.

Before creating a durable plan, spec, audit, summary, or TODO list, establish the
user's explicit request and intended readers. This project's existing design
plan was requested for the author and implementers. A documentation reorganization
must preserve that work without creating a second source for the same decisions.

## Write and maintain the page

Write plain, complete sentences. Distinguish implemented behavior from intended
design, and mark unresolved choices explicitly. Verify commands, paths, versions,
and behavior against source before documenting them. Link to code/configuration
for authoritative values rather than maintaining repeated inventories.

Each Markdown file in `docs/` or `design/` must be at most **20,000 UTF-8 bytes**.
If a page grows beyond that limit, split it by topic and link the resulting pages.
Do not compress wording or remove useful context to fit. Create directories when
they have real content; do not add empty templates.

Keep one authoritative page for each design rule or operational procedure. Delete
obsolete documentation instead of creating an archive directory. Git history and
pull requests retain implementation history. Preserve formal audit/compliance
records unless their removal is explicitly in scope.

When moving a page, search source, configuration, scripts, and other documentation
for the old path. Update or remove references in the same change. Prefer relative
inline links, including a filename when linking to a document. The local checker
validates target paths, not heading fragments or external sites.

Keep shared agent instructions in root `AGENTS.md`; root `CLAUDE.md` points to it.
Put more specific instructions in a scoped `AGENTS.md`, with a `CLAUDE.md` pointer
when needed. Use `ai-docs/` only for durable agent knowledge that fits neither
agent instructions nor human documentation.

## Check the result

Run `npm run docs:check` from the repository root. It needs no dependencies.
The documentation workflow runs the same check on pushes and pull requests.
Review the page from its intended reader's perspective as well; a passing size
and link check cannot determine whether its structure is useful.

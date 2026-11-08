# Repository instructions

- Code, tests, schemas, configuration, and workflows define implemented behavior.
  Correct or remove conflicting prose. Label future design as intended behavior.
- Keep reusable chess definitions and thresholds, including book moves and
  mistake/blunder classification, in shared rules. Processing, achievements, and
  presentation must reuse those rules rather than define their own variants.
- Read only task-relevant documentation. Never read, modify, summarize, or use the
  root `TODO.md` unless the user explicitly requests it.
- `AGENTS.md` is authoritative; `CLAUDE.md` files point to it. Before changing a
  subtree, read any more specific `AGENTS.md` and follow relevant instruction
  pointers. Scoped instructions override broader ones. Avoid duplicating facts
  available from source, configuration, or human documentation.
- Follow the [documentation guide](docs/how-to/write-documentation.md). Do not
  create durable plans, specs, audits, summaries, or TODO lists without an explicit
  user request for a durable document and its readers. The existing design plan
  was requested for the author and implementers; maintain it as decisions change.
- Use chat, issues, pull requests, or ignored `.superpowers/` for temporary work.
  Use Git history for implementation history. Delete obsolete prose rather than
  archiving it; preserve formal audit/compliance records unless removal is in scope.
- Preserve authored game-design writing and thresholds when reorganizing content.
  Do not silently turn unresolved mechanics into approved rules.
- Use [Conventional Commits](CONTRIBUTING.md#commits). Run the checks appropriate
  to the change, including the documentation check when Markdown changes.
- Commit regularly in coherent increments. For each completed iteration, push a
  topic branch, open a pull request against `develop`, and merge it after the
  relevant checks pass. This workflow is authorized without asking for approval
  again unless the user explicitly requests otherwise. Use a merge commit to
  preserve the individual commits, then update the local `develop` branch.
- Every GitHub issue needs a type (`Task`, `Bug`, or `Feature`), at least one topic
  label, and exactly one `priority: high`, `priority: medium`, or `priority: low`
  label. Set them at creation. Every open QA backlog finding links its issue.

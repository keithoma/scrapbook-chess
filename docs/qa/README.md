# QA records

This directory preserves dated evidence for contributors assessing correctness,
performance, and release readiness. Records describe the tested code and
environment at that time; they are not the current configuration reference.

- [Browser proof verification](browser-proof.md) records the initial engine,
  replay, caching, and checkpoint tests.

When a formal audit or verification record is requested, record its scope,
environment, observed results, evidence, and material verification limits. Link
to current procedures and code rather than copying operational instructions.
Keep records under the [documentation size limit](../how-to/write-documentation.md).

Every open backlog finding must link its GitHub issue. Apply the issue type,
topic label, and exactly one priority label required by [repository instructions](../../AGENTS.md).
When remediating a finding, update its status with the fixing change and relevant
verification. Do not describe unperformed checks as passes. Do not create a
speculative backlog from possible future work or ordinary design questions.

Preserve formal records during reorganizations. Remove them only when their
removal is explicitly in scope; do not create a parallel archive tree.

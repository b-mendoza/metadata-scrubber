# Phase 4 I/O Contracts (Shared)

> Load this file when validating Phase 4, interpreting the creator summary, or checking local mutation boundaries. The active playbook supplies every exact platform field, heading, table, inline label, summary line, and child-reference value.

## Shared Workflow Key

`<KEY>` is derived by the active playbook. Pass its value under the established parameter name `TICKET_KEY`: a Jira ticket key for Jira, or the GitHub `ISSUE_SLUG` for GitHub.

Primary inputs:

```text
PLAYBOOK_PATH
<canonical parent URL named by the playbook>
TICKET_KEY=<KEY>
APPROVED_MUTATION_SCOPE
CREATION_PLAYBOOK_PATH
IO_CONTRACT_PATH
EXTERNAL_SOURCES_PATH
```

The canonical URL is required for remote writes. Do not reconstruct GitHub coordinates by splitting the workflow key.

## Approval Contract

Mutation approval is a precondition. It must cover:

- the active playbook's exact remote create/reuse/link or approved fallback actions for tasks in `docs/<KEY>-tasks.md`; and
- the scoped update to `docs/<KEY>-tasks.md`.

Normal orchestration supplies `APPROVED_MUTATION_SCOPE`. On direct invocation, ask once if approval is unclear. If approval remains absent or is declined, return the active playbook's complete blocked-summary shape with `Validation: NOT_RUN`, zero mutation counts, `Plan file: not updated`, and a reason naming the missing approval. Perform no remote or local mutation.

## Plan Preconditions

The normal workflow plan contains:

| Required or expected element | Rule |
| --- | --- |
| `## Tasks` | Required |
| Numbered `## Task <N>:` headings | At least one required; each maps to one child row |
| `## Execution Order Summary` | Preserve when present |
| `## Decisions Log` | Missing is warning-eligible, not blocking, when tasks remain parseable |

A missing file, missing `## Tasks`, or no numbered task headings returns the playbook's `BLOCKED` status with `Validation: NOT_RUN`.

Parse these task subsections when present: `Objective`, `Relevant requirements and context`, `Dependencies / prerequisites`, `Questions to answer before starting`, `Implementation notes`, `Definition of done`, and `Likely files / artifacts affected`. Preserve current clarified content, dependencies, and priority; use `Unknown` for missing priority.

## Output Artifact Contract

Primary local artifact:

```text
docs/<KEY>-tasks.md
```

After successful or partial reconciliation it contains:

1. Exactly one workflow-level child-item section/table in the heading and fixed column order defined by the active playbook.
2. Exactly one playbook-defined inline child reference immediately after every numbered task heading.
3. Exactly one row per parsed task.
4. Matching values between every workflow-table row and inline reference.
5. Only child-reference values accepted by the active playbook.

The active playbook owns placement relative to its platform-specific task-plan summary heading. Preserve all unrelated plan content and heading order.

This file is persistent workflow state for downstream phases. Leave it unstaged; do not commit or push it.

## Mutation Boundary Evidence

Before local edits, record a write ledger and, in a Git repository, capture the pre-edit working-tree state. After editing:

- The run's write ledger must contain only `docs/<KEY>-tasks.md`.
- Compare pre-edit and post-edit changed paths when the environment exposes them.
- If the plan file was already dirty, inspect only the relevant diff hunks or equivalent evidence to ensure unrelated user changes were preserved.
- If this run changed any other path, return the playbook's `FAIL` status with `Validation: FAIL`.

Remote observations are not mutations. Remote create, link, comment, label, transition, close, or fallback actions count as mutations and must be both playbook-supported and present in `APPROVED_MUTATION_SCOPE`.

## Idempotency Contract

Observe before mutating:

- Verify the parent through the active playbook's transport.
- Parse existing workflow-table rows and inline references.
- Resolve every concrete child reference remotely and verify its parent or playbook-defined traceability.
- Count a verified already-satisfied relationship under `Already linked` and do not repeat any remote write for it.
- Treat a concrete reference belonging to another parent or unrelated work item as `BLOCKED`; do not create a replacement silently.
- Create only for tasks that still lack verified accepted traceability.

A fully satisfied, structurally valid plan is success without duplicate remote or local writes.

## Critical Gates

| Gate | Predicate | Checker |
| --- | --- | --- |
| `G_APPROVED_SCOPE` | Exact remote actions and the one local plan path are approved | Coordinator and creator precondition |
| `G_PARENT_AND_LINKAGE` | Parent exists; every reused concrete child ref is safe for that parent | Creator using playbook transport |
| `G_PLAN_LINKAGE` | One playbook-defined row and matching inline value exist per task | Creator post-write validation |
| `G_MUTATION_BOUNDARY` | No local path outside `docs/<KEY>-tasks.md` changed in this run | Write ledger plus available baseline evidence |

On a structural failure, repair only the local Markdown once and re-run only the failed checks. Make no additional remote writes during repair. If validation still fails, return the active playbook's `FAIL` status with `Validation: FAIL`.

## Shared Retry Budget

Create or link work items sequentially, one task at a time. Require the active playbook's definite concrete identifier before counting success. On rate limit, wait 5 seconds and retry the same request once. If the retry fails, record the failure and continue only when the remaining state can still be represented safely. Do not retry permission, authentication, wrong-host, configuration, or unsafe-linkage failures as if they were rate limits.

## Status Pair Semantics

The active playbook preserves its platform status prefix and full summary shape. The status value set remains:

```text
PASS | WARN | FAIL | BLOCKED | ERROR
```

`Validation:` remains:

```text
PASS | FAIL | NOT_RUN
```

| Pair | Meaning |
| --- | --- |
| `PASS` + `PASS` | Every task has verified concrete playbook-accepted linkage and all gates passed |
| `WARN` + `PASS` | Artifact is structurally valid; concrete rows are usable, while playbook-defined warnings, degraded values, or unresolved rows remain visible |
| `BLOCKED` + `NOT_RUN` | Approval, input, plan, existing linkage, or a required user choice made mutation unsafe |
| `FAIL` + `NOT_RUN` | Deterministic platform/transport/configuration/create failure happened before local validation |
| `FAIL` + `FAIL` | Local artifact or mutation-boundary validation failed |
| `ERROR` + `NOT_RUN` | Unexpected tool, filesystem, schema, or environment failure interrupted the run |

Any other pairing is a contract error. `Validation: NOT_RUN` never represents a completed Phase 4 handoff.

## Downstream Readiness

Apply the active playbook's **Child-Reference Values and Downstream Readiness** section. That section owns every accepted concrete, unresolved, or degraded child-reference value and the exact condition under which each value may enter Phase 5.

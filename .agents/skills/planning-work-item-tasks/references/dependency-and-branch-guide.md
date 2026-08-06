# Dependency and Branch Guide

Read this file when `dependency-prioritizer` turns the stage 1 plan into the ordered stage 2 plan. The active playbook (`PLAYBOOK_PATH`) supplies the branch identifier and current-item semantics.

> Apply the local operational rules first. Fetch an optional URL from `EXTERNAL_SOURCES_PATH` only when an edge case or explanation needs current, source-backed support.

## Optional Source Lookups

| Need | Source key in `EXTERNAL_SOURCES_PATH` |
| --- | --- |
| Git ref validity edge case | `git-check-ref-format` |
| `feature/` branch convention background | `feature-branch-workflow` |
| Topological-sort definition or cycle handling | `topological-sort` |
| Prioritization scoring rationale | `rice-scoring` |
| Platform parent / child hierarchy behavior | Active playbook's `External-Source Routing` key |

## Dependency Classes

| Class    | Meaning                                               |
| -------- | ----------------------------------------------------- |
| Hard     | This task cannot start until the dependency completes |
| Soft     | Useful ordering, but not strictly required            |
| Parallel | Tasks can proceed independently                       |

Be conservative. When evidence does not prove a hard prerequisite, classify the relationship as soft unless an upstream output or shared-file conflict makes the order mandatory.

## Prioritization

Score each task from 1 to 5 on Risk, Complexity, Value unlock, and Dependency. Total is the sum out of 20.

Apply ordering rules in this order:

1. Respect hard dependencies.
2. Front-load high-risk tasks to surface blockers early.
3. Front-load high-value-unlock tasks that unblock other work.
4. Defer low-risk, low-complexity tasks when nothing depends on them.
5. Group related tasks when that reduces context switching without invalidating the graph.

The final order must be a valid topological sort. A cycle is `PRIORITIZATION: FAIL`; do not break it by silently downgrading an evidenced hard dependency.

## Deterministic Branch Naming

Generate branch names only after final task numbering is stable.

### Prefix

1. Use the explicit team prefix from the authoritative snapshot or `DECISIONS` when present.
2. Otherwise use `feature/`.
3. A prefix must be a valid Git ref prefix. If it does not end in `/`, append `/` once. Preserve its supplied case and spelling; the generated suffix is lowercase.

### Slug algorithm

Use the same algorithm for task-title and current-work-item-title slugs:

1. Lowercase the source title.
2. Replace each maximal run outside ASCII `[a-z0-9]` with one `-`.
3. Trim leading and trailing `-`.
4. Truncate to 40 characters, then trim a trailing `-` again.
5. Use `task` for an empty task-title slug and `work-item` for an empty current-work-item-title slug.

This algorithm is the contract. Do not choose a different "short" synonym or rewrite the title semantically.

### Shapes

The active playbook supplies `<id-lower>`.

Parent-work-item mode:

```text
<prefix><id-lower>-task-<n>-<task-title-slug>
```

Current-child-item mode:

```text
<prefix><id-lower>-<work-item-title-slug>
```

Branch names must be valid Git refs: no spaces, no `..`, no leading or trailing `/`, no trailing `.lock`, and none of `~`, `^`, `:`, `?`, `*`, `[`, or backslash. Use `git-check-ref-format` only for edge cases not covered here.

## Current-Child-Item Mode

When the stage 1 plan records the playbook's current-item mode, use one branch for every task. Repeat the same `**Branch name:**` value and insert the active playbook's exact execution-summary sentence below the execution-order table. Do not use neutral placeholder nouns in the rendered artifact.

## Quality Self-Check

Before writing Stage 2, verify:

- Every task has `**Priority:**`.
- Every task has `**Branch name:**`.
- Every task has `**Dependencies / prerequisites:**`.
- Every task heading uses `## Task <N>: <Title>`.
- Every dependency reference points to a valid renumbered task.
- No task precedes one of its hard dependencies.
- `## Execution Order Summary` includes a branch column.
- `## Dependency Graph` is present.
- Branches follow the exact prefix, identifier, number, and slug algorithm.
- Current-child-item mode uses one identical branch and the playbook's exact platform wording.
- Original Stage 1 content is preserved except for required annotations, renumbering, and branch names.

## Common Mistakes

- Ordering only by score and violating a hard dependency.
- Marking every relationship hard "to be safe."
- Ignoring shared-file conflict risk.
- Leaving stale letter references after renumbering.
- Generating branch names before final numbering is stable.
- Choosing a subjective short slug instead of applying the algorithm.
- Creating separate branches in current-child-item mode.

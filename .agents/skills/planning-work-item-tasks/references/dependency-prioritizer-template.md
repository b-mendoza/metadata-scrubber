# Dependency Prioritizer Template

Read this file only when assembling Stage 2. Preserve Stage 1 task content; add only ordering, dependency, priority, branch, and graph annotations. Resolve `<SUMMARY_HEADING>` and platform wording from `PLAYBOOK_PATH`. Resolve each branch mechanically from `DEPENDENCY_GUIDE_PATH`.

## Placement

Insert `## Execution Order Summary` immediately after `<SUMMARY_HEADING>` and before `## Problem Framing`.

Retain `## Tasks` immediately before numbered tasks:

```markdown
## Tasks

The numbered task sections below are the executable task list for this plan.
```

## Task Heading and Annotations

Promote lettered Stage 1 headings to numbered Stage 2 headings:

```markdown
## Task 1: <Title> (was Task C)

**Priority:** Risk=4 Complexity=3 Value-unlock=5 Dependency=4 | Total=16/20 **Branch name:** `<deterministically-derived-branch>` **Was:** Task C | **Rationale:** On the critical path; unblocks Tasks 2, 3, and 5.
```

Add dependency annotations after `**Likely files / artifacts affected:**`:

```markdown
**Dependencies / prerequisites:**

- **Hard:** Task 1 (was Task C - creates the schema)
- **Soft:** Task 3 (was Task B - establishes the pattern)
- **Parallel with:** Task 4 (was Task F - unrelated UI work)

**Dependency rationale:** <One sentence per meaningful relationship.>
```

If a task is independent, state that explicitly.

## Execution Order Summary

```markdown
## Execution Order Summary

| Order | Task | Branch | Title | Risk | Complexity | Value | Dep | Total | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | C -> 1 | `<branch-for-task-1>` | Set up auth schema | 4 | 3 | 5 | 4 | 16 | Critical path |
| 2 | A -> 2 | `<branch-for-task-2>` | Configure auth | 3 | 2 | 4 | 3 | 12 | Early risk signal |

### Recommended execution phases

**Phase 1 (sequential - critical path):** Tasks 1, 2 must be done in order.

**Phase 2 (parallelizable):** Tasks 3, 4, 5 can proceed after Phase 1.

**Phase 3 (sequential - finalization):** Tasks 6, 7 depend on Phase 2 completion.
```

In the playbook's current-item mode, repeat the same branch in every row and insert the playbook's exact skip-creation sentence below the table.

## Dependency Graph

Append after `## Notes` and before Stage 3 adds validation output:

```markdown
## Dependency Graph

### Critical path

Task 1 -> Task 3 -> Task 6 -> Task 8

### Parallel groups

- **Group 1 (after Task 1):** Tasks 2, 4, 5
- **Group 2 (after Task 3):** Tasks 6, 7
- **Independent:** Task 9

### Dependency matrix

| Task | Branch | Hard depends on | Soft depends on | Parallel with |
| --- | --- | --- | --- | --- |
| 1 | `<branch-for-task-1>` | - | - | 9 |
| 2 | `<branch-for-task-2>` | 1 | - | 4, 5 |
```

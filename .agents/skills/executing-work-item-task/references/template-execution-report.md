# Execution Report Template

Read this file only when `task-executor` is ready to return its report. Use the structure exactly and replace every placeholder. Use `None` for empty sections.

## Template

```text
## Execution Report

### Status
<ONE OF: "COMPLETE" | "NEEDS_CONTEXT" | "BLOCKED" | "ERROR">

### Refactoring Applied
- `path/to/file.ts` - <what changed and why>
(or `None`)

### Changes Made
- `path/to/file.ts` - <what changed and why>

### Tests
- Commands run: <command list>
- Result: <passing summary or failure summary>
- New or updated tests: <paths or `None`>
- Pre-existing failures: <list or `None`>

### Guidance Used
- Execution plan: <how it informed execution>
- Decisions file: <how it informed execution>
- Additional references: <list or `None`>

### Definition of Done Checklist
- [x] <completed item>
- [ ] <incomplete item and reason>

### Blockers or Context Needed
- <issue or `None`>

When status is `BLOCKED` or `NEEDS_CONTEXT`, name the exact missing
capability, permission, artifact, or decision gap here.

### Out-of-Scope Observations
- <observation or `None`>
```

`COMPLETE` is the normal success outcome. Do not return `COMPLETE` when any Definition of Done item remains unfinished because execution was blocked.

## Example Success

```text
## Execution Report

### Status
COMPLETE

### Refactoring Applied
- `src/tasks/cache.ts` - extracted cache key helper before feature work

### Changes Made
- `src/tasks/cache.ts` - added task-level cache invalidation path

### Tests
- Commands run: `pnpm vitest run src/tasks/cache.test.ts`
- Result: 8/8 passing
- New or updated tests: `src/tasks/cache.test.ts`
- Pre-existing failures: None

### Guidance Used
- Execution plan: used for execution order and focused validation
- Decisions file: confirmed accepted scope for this pass
- Additional references: None

### Definition of Done Checklist
- [x] Cache invalidation added
- [x] Regression tests updated

### Blockers or Context Needed
- None

### Out-of-Scope Observations
- None
```

## Blocked Or Context Outcome

For a `BLOCKED` or `NEEDS_CONTEXT` outcome, set `Status` accordingly, leave action sections as `None` where nothing changed, mark unfinished DoD items with reasons, and name the precise missing capability, permission, artifact, or decision under `Blockers or Context Needed`.

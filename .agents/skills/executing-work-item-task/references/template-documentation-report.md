# Documentation Report Template

Read only when `documentation-writer` is ready to return. Use the structure exactly, replace every placeholder, and fill tracker actions from the active playbook. Use `None` for empty sections.

## Template

```text
## Documentation Report

### Status
<ONE OF: "COMPLETE" | "BLOCKED" | "ERROR">

### Mode
<ONE OF: "UPDATE_TRACKING" | "FINALIZE_TRACKER">

### Files Documented
| File | What was added or updated |
| ---- | ------------------------- |
| `path/to/file.ts` | <summary> |
(or `None`)

### Files Intentionally Skipped
- <file and reason>
(or `None`)

### Documentation Decisions
- <decision or `None`>

### Prose Review
- Matched repository tone: Yes | No (<reason>)

### Final Gate Evidence
- Requirements verification: <verdict or `Not applicable`>
- Clean code review: <verdict or `Not applicable`>
- Architecture review: <verdict or `Not applicable`>
- Security audit: <verdict or `Not applicable`>

### Tracking Updates
- Task plan file: <updated | failed>
- Task status line: <updated | pending final verification | finalized | failed>
- Implementation summary: <updated | failed>
- Files changed list: <updated | failed>
- Tracker table row: <updated | skipped | failed>
- Tracker completion actions: <updated | skipped | deferred | failed>

### Tracker Detail
- Primary reference: <playbook-defined value or `None`>
- Actions: <playbook-defined values or `none`>
- Result: <done | skipped | deferred | blocked | failed> - <detail>

### Blockers or Ambiguities
- <issue or `None`>
```

`COMPLETE` is normal success. `BLOCKED` and `ERROR` are escalations.

## UPDATE_TRACKING Rules

- `Files Documented` lists changed Category B files or `None`.
- Final gate evidence is `Not applicable`.
- Task status remains pending final verification/finalization.
- `Tracker table row` is `updated` when the playbook-defined row exists and the local row was changed; `skipped` only when the row is absent or not applicable.
- `Tracker completion actions` and `Tracker Detail -> Result` are `deferred`.
- Do not perform any playbook-defined final completion action.

## Example UPDATE_TRACKING Success

```text
## Documentation Report

### Status
COMPLETE

### Mode
UPDATE_TRACKING

### Files Documented
| File | What was added or updated |
| ---- | ------------------------- |
| `src/tasks/cache.ts` | Added one docstring and one trade-off comment |

### Files Intentionally Skipped
- `src/tasks/cache.test.ts` - test names were already self-explanatory

### Documentation Decisions
- Matched the repository's sparse comment style

### Prose Review
- Matched repository tone: Yes

### Final Gate Evidence
- Requirements verification: Not applicable
- Clean code review: Not applicable
- Architecture review: Not applicable
- Security audit: Not applicable

### Tracking Updates
- Task plan file: updated
- Task status line: pending final verification
- Implementation summary: updated
- Files changed list: updated
- Tracker table row: updated
- Tracker completion actions: deferred

### Tracker Detail
- Primary reference: None
- Actions: none
- Result: deferred - final tracker completion waits for all gates

### Blockers or Ambiguities
- None
```

## FINALIZE_TRACKER Rules

Set `Files Documented` to `None`, include all non-blocking gate verdicts, finalize the task status line, update the playbook-defined tracking row when present, and record completion actions as `updated` or `skipped`. Missing or failing gate summaries return `BLOCKED`; final tracker actions never run early.

For `BLOCKED`, leave action sections as `None` or `failed` and name the upstream blocker, usually incomplete execution, missing tracking, or a missing/failing gate report.

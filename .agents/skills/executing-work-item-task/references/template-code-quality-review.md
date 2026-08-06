# Code Quality Review Template

Read this file only when `clean-code-reviewer` is ready to return its review. Use the structure exactly and replace every placeholder. Use `None` for empty sections.

## Template

```text
## Code Quality Review

### Verdict
<ONE OF: "PASS" | "PASS WITH SUGGESTIONS" | "NEEDS FIXES" | "BLOCKED" | "ERROR">

### External Validation
- References checked: <list or `None`>
- Recommendations validated: <count>
- Lower-confidence recommendations: <list or `None`>

### Must Fix
| # | Issue | Location | Principle | What to Do |
| - | ----- | -------- | --------- | ---------- |
| 1 | <issue> | `file.ts` | <principle> | <action> |
(or `None`)

### Should Fix
| # | Issue | Location | Principle | What to Do |
| - | ----- | -------- | --------- | ---------- |
| 1 | <issue> | `file.ts` | <principle> | <action> |
(or `None`)

### Suggestions
- <suggestion or `None`>

### What Went Well
- <positive observation or `None`>

### Blockers or Ambiguities
- <issue or `None`>
```

`PASS`, `PASS WITH SUGGESTIONS`, and `NEEDS FIXES` are normal outcomes. `BLOCKED` and `ERROR` are escalations.

## Example Needs Fixes

```text
## Code Quality Review

### Verdict
NEEDS FIXES

### External Validation
- References checked: None
- Recommendations validated: 0
- Lower-confidence recommendations: None

### Must Fix
| # | Issue | Location | Principle | What to Do |
| - | ----- | -------- | --------- | ---------- |
| 1 | Helper mixes cache invalidation and logging side effects | `src/tasks/cache.ts` | single responsibility | Split logging into a separate collaborator or wrapper |

### Should Fix
None

### Suggestions
- None

### What Went Well
- Tests cover the main happy path and regression path clearly

### Blockers or Ambiguities
- None
```

## Blocked Outcome

For a `BLOCKED` outcome, set `Verdict` to `BLOCKED`, leave finding sections as `None`, and name the precise scope ambiguity under `Blockers or Ambiguities`.

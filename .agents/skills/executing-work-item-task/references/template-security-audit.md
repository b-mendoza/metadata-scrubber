# Security Audit Template

Read this file only when `security-auditor` is ready to return its audit. Use the structure exactly and replace every placeholder. Use `None` for empty sections.

## Template

```text
## Security Audit

### Verdict
<ONE OF: "PASS" | "PASS WITH ADVISORIES" | "NEEDS FIXES" | "BLOCKED" | "ERROR">

### External Validation
- References checked: <list or `None`>
- Security docs reviewed: <count>
- Lower-confidence recommendations: <list or `None`>

### Critical Issues
| # | Issue | Location | Category | What to Do |
| - | ----- | -------- | -------- | ---------- |
| 1 | <issue> | `file.ts` | <category> | <action> |
(or `None`)

### High Issues
| # | Issue | Location | Category | What to Do |
| - | ----- | -------- | -------- | ---------- |
| 1 | <issue> | `file.ts` | <category> | <action> |
(or `None`)

### Medium Issues
| # | Issue | Location | Category | What to Do |
| - | ----- | -------- | -------- | ---------- |
| 1 | <issue> | `file.ts` | <category> | <action> |
(or `None`)

### Advisories
- <advisory or `None`>

### What Went Well
- <positive observation or `None`>

### Credential Scan Summary
- Files scanned: <count>
- Potential secrets found: <count or `None`>
- False positives: <count or `None`>

### Blockers or Ambiguities
- <issue or `None`>
```

`PASS`, `PASS WITH ADVISORIES`, and `NEEDS FIXES` are normal outcomes. `BLOCKED` and `ERROR` are escalations.

## Example Pass With Advisories

```text
## Security Audit

### Verdict
PASS WITH ADVISORIES

### External Validation
- References checked: `express`
- Security docs reviewed: 1
- Lower-confidence recommendations: None

### Critical Issues
None

### High Issues
None

### Medium Issues
None

### Advisories
- `src/tasks/cache.ts`: consider redacting task ids from debug logs if this logger reaches shared environments

### What Went Well
- Input validation remains at the request boundary and no secrets were introduced

### Credential Scan Summary
- Files scanned: 3
- Potential secrets found: None
- False positives: None

### Blockers or Ambiguities
- None
```

## Blocked Outcome

For a `BLOCKED` outcome, set `Verdict` to `BLOCKED`, leave issue sections as `None`, set `Files scanned: 0`, and name the precise scope ambiguity under `Blockers or Ambiguities`.

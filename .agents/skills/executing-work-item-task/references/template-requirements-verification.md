# Requirements Verification Template

Read this file only when `requirements-verifier` is ready to return its verdict. Use the structure exactly and replace every placeholder. Use `None` for empty sections.

## Template

```text
## Requirements Verification

### Verdict
<ONE OF: "PASS" | "FAIL" | "BLOCKED" | "ERROR">

### Requirements Checklist
| # | Requirement | Implemented | Tested | Documented | Status |
| - | ----------- | ----------- | ------ | ---------- | ------ |
| 1 | <condition> | Yes/No | Yes/No | Yes/No | OK/GAP |

### Gaps
| # | Requirement | Gap Description | What Needs to Happen |
| - | ----------- | --------------- | -------------------- |
| 1 | <condition> | <gap> | <next action> |
(or `None`)

### Regression Check
- Existing tests: <summary>
- New tests: <summary>

### Summary
<2-3 sentences>
```

If the verdict is `BLOCKED`, the summary must name the blocked upstream step and the blocker reason.

## Example Fail

```text
## Requirements Verification

### Verdict
FAIL

### Requirements Checklist
| # | Requirement | Implemented | Tested | Documented | Status |
| - | ----------- | ----------- | ------ | ---------- | ------ |
| 1 | Invalidate cache after update | Yes | Yes | Yes | OK |
| 2 | Handle missing task id gracefully | No | No | No | GAP |

### Gaps
| # | Requirement | Gap Description | What Needs to Happen |
| - | ----------- | --------------- | -------------------- |
| 1 | Handle missing task id gracefully | No guard clause or test covers this path | Add the guard behavior and one focused test |

### Regression Check
- Existing tests: all passing
- New tests: 8/8 passing

### Summary
One DoD item is open. Address the missing guard-path behavior before quality
gates run.
```

## Blocked Outcome

For a `BLOCKED` outcome, set `Verdict` to `BLOCKED`, mark blocked DoD items as `GAP`, leave `Gaps` as `None`, and name the blocked upstream step plus reason in the summary.

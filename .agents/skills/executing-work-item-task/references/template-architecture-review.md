# Architecture Review Template

Read this file only when `architecture-reviewer` is ready to return its review. Use the structure exactly and replace every placeholder. Use `None` for empty sections.

## Template

```text
## Architecture Review

### Verdict
<ONE OF: "PASS" | "PASS WITH SUGGESTIONS" | "NEEDS FIXES" | "BLOCKED" | "ERROR">

### External Validation
- References checked: <list or `None`>
- Recommendations validated: <count>
- Lower-confidence recommendations: <list or `None`>

### DDD Assessment
| Principle | Status | Notes |
| --------- | ------ | ----- |
| Ubiquitous language | OK/WARN/FAIL/N/A | <notes> |
| Bounded contexts | OK/WARN/FAIL/N/A | <notes> |
| Entities / value objects | OK/WARN/FAIL/N/A | <notes> |
| Domain events / side effects | OK/WARN/FAIL/N/A | <notes> |
| Anti-corruption boundaries | OK/WARN/FAIL/N/A | <notes> |

### Composition Assessment
| Principle | Status | Notes |
| --------- | ------ | ----- |
| Immutability | OK/WARN/FAIL/N/A | <notes> |
| Pure or isolated side effects | OK/WARN/FAIL/N/A | <notes> |
| Functional composition | OK/WARN/FAIL/N/A | <notes> |
| Declarative flow | OK/WARN/FAIL/N/A | <notes> |

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

## Example Pass With Suggestions

```text
## Architecture Review

### Verdict
PASS WITH SUGGESTIONS

### External Validation
- References checked: None
- Recommendations validated: 0
- Lower-confidence recommendations: None

### DDD Assessment
| Principle | Status | Notes |
| --------- | ------ | ----- |
| Ubiquitous language | OK | Names match the task domain |
| Bounded contexts | OK | Cache logic stays in the task module |
| Entities / value objects | WARN | No value object for cache key, low risk here |
| Domain events / side effects | OK | Side effect is isolated in one function |
| Anti-corruption boundaries | N/A | No external integration in scope |

### Composition Assessment
| Principle | Status | Notes |
| --------- | ------ | ----- |
| Immutability | OK | Inputs are not mutated |
| Pure or isolated side effects | OK | Logging stays at the edge |
| Functional composition | WARN | Helper chain could be split later |
| Declarative flow | OK | Control flow is easy to follow |

### Must Fix
None

### Should Fix
None

### Suggestions
- Consider extracting the cache-key tuple into a tiny value object if this area grows

### What Went Well
- Preserved clear boundaries between orchestration and cache helpers

### Blockers or Ambiguities
- None
```

## Blocked Outcome

For a `BLOCKED` outcome, set `Verdict` to `BLOCKED`, leave assessment and finding sections as `None`, and name the precise scope ambiguity under `Blockers or Ambiguities`.

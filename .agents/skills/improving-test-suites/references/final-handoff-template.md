# Final Handoff Template

> Load this file immediately before the final user-visible response. For a
> sample completed handoff, load `./report-examples.md` only when
> needed.

Use this template after the workflow completes, blocks, errors, or when no safe
edit is justified. Choose exactly one handoff status:
`CHANGED_PASS`, `COMPLETE_NO_SAFE_CHANGE`,
`COMPLETE_PRODUCTION_BUG_EXPOSED`, `VALIDATION_FAILED_AFTER_REPAIR`,
`COMPLETE_ERROR`, or `COMPLETE_BLOCKED`.

```text
Handoff status: CHANGED_PASS | COMPLETE_NO_SAFE_CHANGE | COMPLETE_PRODUCTION_BUG_EXPOSED | VALIDATION_FAILED_AFTER_REPAIR | COMPLETE_ERROR | COMPLETE_BLOCKED
Result: <one-sentence neutral result that matches the status: changed, no safe change, production bug exposed, validation still failing, blocked, or error>

Diagnosis:
- <original suite problem summary>

Harness decision:
- Deleted: <tests/areas or none>
- Rewritten: <tests/areas or none>
- Added: <tests/areas or none>
- Kept: <high-value behaviors preserved, or no-op rationale when unchanged>

Files changed:
- none | <path>: <summary>

Validation:
- <command>: <PASS/FAIL/BLOCKED/ERROR>

References fetched:
- none | <urls that materially influenced decisions>

Remaining risks:
- none | <skipped checks, unresolved blockers, production bug candidates, validation limitations, or scope limits>

Approvals and blockers:
- none | <production-code approval, unsupported-source approval, missing decision, command, dependency, or prerequisite>
```

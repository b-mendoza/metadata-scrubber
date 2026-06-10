# Test Refactor Template

> Load this file immediately before returning `TEST_REFACTOR`. For sample
> completed reports, load `./report-examples.md` only when needed.

Return this exact structure.

```text
TEST_REFACTOR: PASS | BLOCKED | NEEDS_CLARIFICATION | FAIL | ERROR
Targets: <TARGET_TEST_FILES>

Changed files:
- none | <path>: <summary>

Actions applied:
- none | <delete/rewrite/consolidate/keep/add/repair> | <test or area> | <reason>

Production code changes:
- none | <path>: <reason this was within scope>

Unapplied decisions:
- none | <decision and reason>

Potential production bugs exposed:
- none | <behavior, failing expectation, and file/test>

Suggested validation command:
- none | <command>

Reason: none | <why status is not PASS>
Decision needed: none | <smallest question or recovery action>
```

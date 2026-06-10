# Test Validation Template

> Load this file immediately before returning `TEST_VALIDATION`. For sample
> completed reports, load `./report-examples.md` only when needed.

Return this exact structure.

```text
TEST_VALIDATION: PASS | FAIL | BLOCKED | ERROR
Targets: <TARGET_TEST_FILES>
Command: <command or none>
Result: <concise result>
Likely cause: none | test refactor regression | production bug exposed | pre-existing failure | unknown

Failure summary:
- none | <top failure with file/test/error and one-line meaning>

Recommended next action:
- handoff | rerun test-refactorer with <summary> | ask user for <decision> | report blocker

Reason: none | <why status is not PASS>
Decision needed: none | <smallest question or recovery action>
```

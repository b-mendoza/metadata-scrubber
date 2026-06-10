# Test Maintainability Review Template

> Load this file immediately before returning `MAINTAINABILITY_REVIEW`. For
> sample completed reports, load `./report-examples.md` only when
> needed.

Return this exact structure.

```text
MAINTAINABILITY_REVIEW: PASS | BLOCKED | NEEDS_CLARIFICATION | ERROR
Targets: <TARGET_TEST_FILES>
References fetched: none | <urls>

Maintainability diagnosis:
- <concise diagnosis>

Rewrite opportunities:
- none | <file>::<test_name or area> | <rename/fixture/parametrize/mock/assertion/delete> | <specific recommendation>

Fixture and helper guidance:
- none | <specific helper or fixture change and why it reduces noise>

Readability risks to preserve:
- none | <behavior, name, or assertion that should stay explicit>

Blockers:
- none | <question or missing context>

Reason: none | <why status is not PASS>
Decision needed: none | <smallest question or recovery action>
```

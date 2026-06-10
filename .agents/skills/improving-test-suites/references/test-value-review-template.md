# Test Value Review Template

> Load this file immediately before returning `TEST_VALUE_REVIEW`. For sample
> completed reports, load `./report-examples.md` only when needed.

Return this exact structure.

```text
TEST_VALUE_REVIEW: PASS | BLOCKED | NEEDS_CLARIFICATION | ERROR
Targets: <TARGET_TEST_FILES>
References fetched: none | <urls>

Suite diagnosis:
- <concise diagnosis>

Low-value tests:
- none | <file>::<test_name> | <category> | <keep/rewrite/delete/consolidate> | <reason>

High-value behaviors:
- none | <behavior or contract worth protecting> | Current coverage: <none/weak/good>

Missing high-value tests:
- none | <behavior, failure mode, or edge case to add>

Minimal target harness:
- <ordered keep/rewrite/delete/add recommendations>

Review routing:
- API_SECURITY_REVIEW: required | optional | not needed | <reason>
- MAINTAINABILITY_REVIEW: required | optional | not needed | <reason>

Blockers:
- none | <question or missing context>

Reason: none | <why status is not PASS>
Decision needed: none | <smallest question or recovery action>
```

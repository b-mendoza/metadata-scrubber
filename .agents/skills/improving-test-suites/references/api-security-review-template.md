# API Security Review Template

> Load this file immediately before returning `API_SECURITY_REVIEW`. For sample
> completed reports, load `./report-examples.md` only when needed.

Return this exact structure.

```text
API_SECURITY_REVIEW: PASS | NOT_APPLICABLE | BLOCKED | NEEDS_CLARIFICATION | ERROR
Targets: <TARGET_TEST_FILES>
References fetched: none | <urls>
Freshness gap: none | <source or claim that could not be verified>

Surface reviewed:
- <API, schema, auth, input, file, network, or boundary surface>

Current high-value coverage:
- none | <covered security-relevant behavior>

Missing high-value tests:
- none | <specific behavior to add and why it matters>

Low-value security tests:
- none | <test that appears security-related but does not prove useful behavior>

Recommended minimal additions:
- none | <smallest tests to add or rewrite>

Blockers:
- none | <question or missing context>

Reason: none | <why status is not PASS or NOT_APPLICABLE>
Decision needed: none | <smallest question or recovery action>
```

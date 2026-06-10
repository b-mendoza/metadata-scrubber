# Report Examples

> Load this file only when an output template needs a concrete completed sample.
> Do not load it during normal reporting when the template structure is enough.

These examples show realistic formatting without adding example prose to every
template load.

## Test Value Review

```text
TEST_VALUE_REVIEW: PASS
Targets: tests/test_invoice_api.py
References fetched: https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html

Suite diagnosis:
- The suite mostly verifies repository call order instead of invoice API results.

Low-value tests:
- tests/test_invoice_api.py::test_calls_repository_first | implementation-detail-assertion | delete | The call order is not part of the public contract.

High-value behaviors:
- Rejects invoice creation when required account id is missing | Current coverage: weak

Missing high-value tests:
- Unauthorized account id should be rejected with the documented error.

Minimal target harness:
- Keep the success-path public response test.
- Rewrite validation tests around API responses instead of mock calls.
- Add one unauthorized account test.
- Delete repository call-order tests.

Review routing:
- API_SECURITY_REVIEW: required | Invoice creation accepts external account ids.
- MAINTAINABILITY_REVIEW: required | Invalid payload tests duplicate setup.

Blockers:
- none

Reason: none
Decision needed: none
```

## API Security Review

```text
API_SECURITY_REVIEW: PASS
Targets: tests/test_invoice_api.py
References fetched: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
Freshness gap: none

Surface reviewed:
- Invoice creation API accepts account ids and caller identity from external input.

Current high-value coverage:
- Missing required account id is rejected with a validation error.

Missing high-value tests:
- Caller cannot create an invoice for an account they do not own.

Low-value security tests:
- none

Recommended minimal additions:
- Add one unauthorized account test through the public API response.

Blockers:
- none

Reason: none
Decision needed: none
```

## Maintainability Review

```text
MAINTAINABILITY_REVIEW: PASS
Targets: tests/test_invoice_api.py
References fetched: https://docs.pytest.org/en/stable/example/parametrize.html

Maintainability diagnosis:
- Three invalid payload tests duplicate setup and hide the only changing field.

Rewrite opportunities:
- tests/test_invoice_api.py::test_invalid_payloads | parametrize | Use one parametrized test for missing account id, negative amount, and unknown currency.

Fixture and helper guidance:
- Add a local `valid_invoice_payload()` helper with only contract-level defaults.

Readability risks to preserve:
- Keep unauthorized account behavior as a separate named test because it documents a distinct security rule.

Blockers:
- none

Reason: none
Decision needed: none
```

## Refactor And Validation

```text
TEST_REFACTOR: PASS
Targets: tests/test_invoice_api.py

Changed files:
- tests/test_invoice_api.py: Replaced mock-order assertions with public API response tests and parametrized invalid payload cases.

Actions applied:
- delete | test_calls_repository_first | Repository call order is not public behavior.
- rewrite | invalid payload tests | Assertions now check API validation responses.
- add | unauthorized account test | Protects account ownership contract.

Production code changes:
- none

Unapplied decisions:
- none

Potential production bugs exposed:
- none

Suggested validation command:
- pytest tests/test_invoice_api.py -q

Reason: none
Decision needed: none
```

```text
TEST_VALIDATION: PASS
Targets: tests/test_invoice_api.py
Command: pytest tests/test_invoice_api.py -q
Result: 6 passed
Likely cause: none

Failure summary:
- none

Recommended next action:
- handoff

Reason: none
Decision needed: none
```

## Final Handoff

```text
Handoff status: CHANGED_PASS
Result: The invoice API suite now protects response-level behavior instead of repository call order.

Diagnosis:
- The previous suite coupled most assertions to mock interaction order and duplicated invalid payload setup.

Harness decision:
- Deleted: repository call-order tests
- Rewritten: invalid payload checks around API validation responses
- Added: unauthorized account id rejection
- Kept: successful invoice creation response contract

Files changed:
- tests/test_invoice_api.py: Replaced interaction assertions with behavior assertions and parametrized invalid payload cases.

Validation:
- pytest tests/test_invoice_api.py -q: PASS

References fetched:
- https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html

Remaining risks:
- none

Approvals and blockers:
- none
```

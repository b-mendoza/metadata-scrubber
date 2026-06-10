# Test Quality Heuristics

> Read this file before classifying tests during a value, API/security, or
> maintainability review, or before synthesizing the minimal harness decision.
> For deeper rationale, fetch the relevant URL from
> `./external-sources.md`.

This file holds only operational categories and ordering rules. Deeper testing
rationale lives behind the source keys in `./external-sources.md` and
is fetched only when it changes a concrete decision.

## Trade-Off Priority

Resolve conflicting findings in this order. Lower-priority concerns must not
override higher-priority ones:

1. Public contracts and production-relevant behavior
2. Schema validation, security-sensitive behavior, and meaningful failure handling
3. Realistic edge cases and compatibility commitments
4. Readability, fixture design, and parametrization
5. Coverage metrics

## Low-Value Test Categories

Mark a target test as a delete, rewrite, or consolidate candidate when it
matches one of these categories and does not protect a high-value behavior.

| Category | Local signal | Optional source keys |
| -------- | ------------ | -------------------- |
| `implementation-detail-assertion` | Verifies private call order, internal state, or refactor-sensitive structure instead of observable behavior | `behavior-vs-implementation`, `prefer-public-apis`, `implementation-details-react` |
| `duplicated-coverage` | Repeats an already-covered behavior with no new input class or failure mode | `how-to-know-what-to-test`, `test-pyramid` |
| `trivial-assertion` | Exercises a getter, constant, or constructor without proving meaningful behavior | `how-to-know-what-to-test`, `swe-google-unit-testing` |
| `unstable-mock` | Pins mock order or call counts that are incidental to the public contract | `mocks-arent-stubs`, `behavior-vs-implementation` |
| `over-specific-fixture` | Depends on incidental fixture shape that changes with unrelated code | `damp-not-dry`, `xunit-test-patterns` |
| `unclear-business-value` | No reviewer can name the rule the passing test protects | `how-to-know-what-to-test`, `swe-google-unit-testing` |
| `verbose-low-yield` | Uses long setup or many assertions for confidence a smaller test would match | `damp-not-dry`, `pytest-parametrize` |

## High-Value Behavior Categories

Recommend keeping or adding a test when it protects one of these behaviors.

| Category | Keep or add when | Optional source keys |
| -------- | ---------------- | -------------------- |
| `public-contract` | A public API, library, tool, or UI contract that callers depend on can break | `prefer-public-apis`, `testing-library-principles` |
| `critical-business-logic` | Pricing, billing, eligibility, state machines, or other core rules can regress | `how-to-know-what-to-test`, `swe-google-unit-testing` |
| `schema-validation` | Invalid, missing, malformed, or unsafe inputs must be rejected predictably | `owasp-api-testing`, `owasp-api-top-10` |
| `security-sensitive-behavior` | Auth, permissions, ownership, secrets, path, network, file, or unsafe deserialization boundaries can fail | `owasp-api-top-10`, `owasp-cheatsheets` |
| `meaningful-failure-handling` | The caller, user, or operator observes a specific error path | `swe-google-unit-testing`, `how-to-know-what-to-test` |
| `production-edge-case` | Realistic concurrency, retry, idempotency, pagination, time, or timezone behavior can break | `test-pyramid`, `swe-google-unit-testing` |

## Minimal Harness Rules

When proposing the minimal target harness:

- Prefer one parametrized test for the same rule across input classes.
- Assert through public behavior, validation results, errors, outputs, or
  observable contracts, not through mock interaction order.
- Keep one named test per distinct security or contract rule, even when it
  could be parametrized, so the rule remains discoverable.
- Replace shared helpers that hide the rule under test with a small local
  helper or inline setup (see `damp-not-dry` for rationale).
- Do not add tests just to lift coverage; add tests only when they protect a
  named high-value behavior.

## Classification Reporting

Use the category names above verbatim when filling `Low-value tests`,
`High-value behaviors`, and `Recommended minimal additions` slots in the review
templates. This keeps the orchestrator's synthesis predictable.

## Standalone Reminder

This skill remains usable when external URLs are unreachable. Heuristics here
plus repository code and bundled templates are sufficient for a safe minimal
harness decision; external sources add depth, not core capability.

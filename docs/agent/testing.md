# Testing principles

These apply to every service, in any language. Test tooling and gotchas specific to one service live in that service's `docs/agent/`.

## What to test

- **Test our code's decisions, not upstream contracts.** Assert on branching logic, routing, configuration wiring, and the transformations our code performs. Do not test behavior owned by a dependency (a constructor throwing on invalid input, an SDK raising its own error type).
- **Test current behavior, not hypothetical future logic.** If production code passes a value through unchanged, do not assert on that value. Add the test when the transformation is added.
- **Apply risk-based coverage.** Core business logic (routing, classification, selection) deserves thorough testing. Simple pass-throughs, getters, and guarantees the type system already enforces need little or none.

## What not to test

- **Mock pass-through.** If a test sets a mock return value and asserts the result equals it, it tests `return input`, not business logic. Remove these.
- **Dependency internals.** Do not build test infrastructure (schemas, parsers) that mirrors a third-party library's internal shape. It breaks with confusing errors when the library changes internals, even though production behavior is unchanged.
- **Configuration files.** Do not write tests that assert the contents of a configuration file consumed by an external tool (CI workflows, linter configs, deployment manifests). Such a test restates the file without proving what actually matters — that the consumer accepts it: it can pass while the file has unsupported fields, missing required ones, or invalid values. If the consuming tool ships a validator (a lint, check, or dry-run command), run that; otherwise the file is verified by the behavior it produces, not by a test mirroring its text. Tests exist to pin our system's behavior, not to transcribe someone else's input format.

## How to assert

- **Assert only on the fields our code controls.** Avoid pinning the full structure of a call's arguments.
- **Import production constants instead of duplicating them.** When a test must verify a specific constant is used, import it from the production module. This avoids string-duplication drift and makes the test break intentionally when the constant changes.
- **Give outsized-risk constants intentionally brittle tests.** When a single constant can silently change cost, behavior, or a contract (an AI model ID, a system prompt, a rate limit, a pricing tier), assert its exact wiring via the imported constant. The brittleness is the point: the suite may be the only line of defense against that regression.
- **Use inline literals for simple test data.** Reach for builders or factories only when several tests share non-trivial setup; otherwise they add indirection without value.

## When tests fail

- **Never buy green by weakening the suite.** Do not delete, skip, or loosen the assertions of a failing test to make it pass. Fix the code; if the test itself is wrong, say so explicitly and change the test as its own deliberate, explained step.
- **Never paper over flakiness.** Do not fix a racy or flaky test with sleeps, arbitrary timeouts, or blind retries. Fix the underlying synchronization, or report the flake if the cause is out of scope.
- **A bug-fix test must fail without the fix.** Before trusting a regression test, confirm it fails against the unfixed code; a test that passes both with and without the change proves nothing about the bug.
- **Missing prerequisites are failures, not skips.** If a test needs a tool, service, or configuration that is absent, fail with an actionable error rather than silently skipping — a skipped test reads as green while covering nothing.
- **Disclose coverage gaps.** If part of a change cannot be exercised by the suite, state that gap plainly rather than letting green checks imply full coverage.

## How to organize

- **Group by behavior domain, not arbitrary codes.** Use descriptive group names (a `describe` block, a `t.Run` subtest): "MIME routing", "error handling" — not "Group A".
- **Name tests in behavior-first active voice.** A name should read as a sentence describing what the system does ("routes PDF through the file content part"), with no alphanumeric prefixes.
- **Classify tests by real importance.** A test covering one of two branches in core logic is core behavior, not an "edge case". Place it accordingly.

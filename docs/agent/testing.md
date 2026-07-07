# Testing principles

These apply to every service, in any language. Test tooling and gotchas specific to one service live in that service's `docs/agent/`.

## What to test

- **Test our code's decisions, not upstream contracts.** Assert on branching logic, routing, configuration wiring, and the transformations our code performs. Do not test behavior owned by a dependency (a constructor throwing on invalid input, an SDK raising its own error type).
- **Test current behavior, not hypothetical future logic.** If production code passes a value through unchanged, do not assert on that value. Add the test when the transformation is added.
- **Apply risk-based coverage.** Core business logic (routing, classification, selection) deserves thorough testing. Simple pass-throughs, getters, and guarantees the type system already enforces need little or none.

## What not to test

- **Mock pass-through.** If a test sets a mock return value and asserts the result equals it, it tests `return input`, not business logic. Remove these.
- **Dependency internals.** Do not build test infrastructure (schemas, parsers) that mirrors a third-party library's internal shape. It breaks with confusing errors when the library changes internals, even though production behavior is unchanged.

## How to assert

- **Assert only on the fields our code controls.** Avoid pinning the full structure of a call's arguments.
- **Import production constants instead of duplicating them.** When a test must verify a specific constant is used, import it from the production module. This avoids string-duplication drift and makes the test break intentionally when the constant changes.
- **Use inline literals for simple test data.** Reach for builders or factories only when several tests share non-trivial setup; otherwise they add indirection without value.

## How to organize

- **Group by behavior domain, not arbitrary codes.** Use descriptive group names (a `describe` block, a `t.Run` subtest): "MIME routing", "error handling" — not "Group A".
- **Name tests in behavior-first active voice.** A name should read as a sentence describing what the system does ("routes PDF through the file content part"), with no alphanumeric prefixes.
- **Classify tests by real importance.** A test covering one of two branches in core logic is core behavior, not an "edge case". Place it accordingly.

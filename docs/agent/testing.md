# Testing principles

These apply to every service, in any language. Test tooling and gotchas specific to one service live in that service's own guides.

## What to test

- **Test the system's behavior: the decisions our code makes.** Assert on branching logic, routing, wiring, and the transformations our code performs, in proportion to risk — core logic deserves thorough coverage; pass-throughs, getters, and guarantees the type system already enforces need little or none.
- **Test what exists today.** Assert on current behavior, not hypothetical future logic. If code passes a value through unchanged, add the test when the transformation is added.
- **What we don't own proves itself elsewhere.** A dependency's contracts and internals are its maintainers' responsibility; a mock's return value asserted back is a test of `return input`; test infrastructure mirroring a library's internal shape breaks when internals change though behavior did not; and a configuration file consumed by an external tool is proven by that tool's own validator (a lint, check, or dry-run command) or by the behavior it produces — never by a test transcribing its contents.

## How to assert

- **Import production constants instead of duplicating them.** When a test must verify a specific constant is used, import it from the production module. This avoids string-duplication drift and intentionally causes the test to break when the constant changes.
- **Give outsized-risk constants intentionally brittle tests.** When a single constant can silently change cost, behavior, or a contract (an AI model ID, a system prompt, a rate limit, a pricing tier), assert its exact wiring via the imported constant. The brittleness is the point: the suite may be the only line of defense against that regression.
- **Use inline literals for simple test data.** Reach for builders or factories only when several tests share non-trivial setup; otherwise they add indirection without value.

## When tests fail

- **Earn green by fixing the cause.** Fix the code or the synchronization. When the test is wrong, change it as a separate and explained step.
- **A bug-fix test must fail without the fix.** Confirm the regression test fails against the unfixed code; a test that passes both with and without the change proves nothing about the bug.

## How to organize

- **Classify tests by real importance.** A test covering one of two branches in core logic is core behavior, not an "edge case". Place it accordingly.

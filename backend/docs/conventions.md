# Backend design practices

This guide describes general practices. It does not prescribe a specific use case, code pattern, or implementation. The code is the source of truth. If this guide and the code disagree, follow the code.

Read the [root agent guide](../../AGENTS.md) for shared principles and [Code design](../../docs/agent/code-design.md) for general design practices.

## Unknown and failed states

- Report unknown or invalid input or state as an error. Do not report success without evidence.
- Keep failure causes distinct when callers need different actions. Classify a failure by the system that caused it.
- Handle and report failures when writing output.

## Private data in responses and logs

- Keep sensitive data out of public errors and logs. Test that sensitive data stays private.

## Scope and resource limits

- Verify that every target is inside the authorized scope before a destructive operation.
- Bound both the duration and size of external work.
- Name a limit for what it actually bounds. Do not assume it bounds other resources.
- Change resource limits only with measured evidence.
- Keep automated-check coverage aligned with the code it must inspect.

## Construction

- Preserve data boundaries when combining input with fixed structure.
- Use a value's actual meaning to select behavior. Do not infer identity from display text.
- Keep dependencies explicit. Keep tests from changing shared state.
- Require needed dependencies explicitly. Do not silently select another dependency.

## Cleanup

- Preserve the original failure when cleanup also fails.

## Tests

- Test behavior through the boundary whose coverage you claim.
- Coordinate concurrent tests by observable events. Do not depend on machine speed.
- Assert facts required by the contract. Ignore unrelated order and detail.
- Test public behavior. Do not pin details that callers cannot observe.

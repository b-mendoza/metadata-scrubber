These rules apply to `backend/**`.

## Boundary contracts

Report as a blocking bug.

- Require each boundary to declare and validate its input before domain logic
  runs. This includes external input.
- Require contract violations and unknown values to return an explicit error.
- Do not accept silent coercion, default values, or dropped input.
- Prefer construction that removes invalid states.

## Specific application code

Report as a blocking bug.

- Require specific and explicit application code for each use case.
- Do not accept one general function for many use cases.
- Require deletion of a helper that only avoids repeated code. Require the code at
  each call site instead. Accept duplication in application code.

## Generic constraints

Report as a blocking bug.

- Require every generic type parameter to declare an explicit, meaningful
  constraint.

## Failed checks

Report as a blocking bug.

- Require a fix for the cause of a failed check.
- Accept a narrow exception with a stated reason. Reject broad exceptions.
- Keep an exception only where an external API forces it.

## Test payloads

For `backend/**/*_test.go`, report as a non-blocking bug.

- Require each test to build request and response payloads from the concrete typed
  contracts at the call site.
- Require serialization at that call site and a check of each error.
- Accept raw wire literals only in dedicated wire-contract tests.

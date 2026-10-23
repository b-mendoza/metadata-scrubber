These rules apply to `frontend/src/**`.

## Boundary contracts

Report as a blocking bug.

- Require each boundary to declare and validate external input before domain logic
  runs.
- Require contract violations and unknown values to fail with a clear error.
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

## Test payloads

Report as a non-blocking bug.

- Require each test to build request and response payloads from the concrete typed
  contracts at the call site.
- Require serialization at that call site and a check of each error.
- Accept raw wire literals only in dedicated wire-contract tests.

## Frontend server HTTP boundaries

Report as a blocking bug.

- Require service URLs from request-scoped application bindings.
- Require server code to return client-safe errors.
- Reject client-facing messages that include backend response bodies, service
  URLs, schema issues, or dependency error text.

## Partial call assertions

Report as a non-blocking bug.

- Review test call assertions. Require a partial matcher when the code controls
  only part of a value.
- Do not require an exact full-structure assertion unless the code controls the
  complete value.

## Design intent and simplicity

Report as a non-blocking bug.

- Report unclear or needless abstractions.
- Check that the change solves the stated problem with the smallest clear design.

## Names

Report as a non-blocking bug.

- Review names for clear domain meaning beyond any deterministic denylist.
- Accept short conventional names that the language community uses.

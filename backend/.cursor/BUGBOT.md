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

Report as a non-blocking bug.

- Require each test to build request and response payloads from the concrete typed
  contracts at the call site.
- Require serialization at that call site and a check of each error.
- Accept raw wire literals only in dedicated wire-contract tests.

## Partial call assertions

Report as a non-blocking bug.

- Review test call assertions. Require partial assertions for values with fields
  that the code under test does not control.
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

## Review context

- [Backend guide](../AGENTS.md)
- [Decided backend conventions](../docs/conventions.md)

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

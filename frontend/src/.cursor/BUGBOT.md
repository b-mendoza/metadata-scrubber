These rules apply to `frontend/src/**`.

## Boundary contracts

Report as a blocking bug.

- Require each boundary to declare and validate external input before domain logic
  runs.
- Require contract violations and unknown values to fail with a clear error.
- Do not accept silent coercion, default values, or dropped input.
- Prefer construction that removes invalid states.

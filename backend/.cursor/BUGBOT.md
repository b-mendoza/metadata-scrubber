These rules apply to `backend/**`.

## Boundary contracts

Report as a blocking bug.

- Require each boundary to declare and validate its input before domain logic
  runs. This includes external input.
- Require contract violations and unknown values to return an explicit error.
- Do not accept silent coercion, default values, or dropped input.
- Prefer construction that removes invalid states.

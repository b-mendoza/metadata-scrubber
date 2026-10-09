# Code design

Use these general design practices in every service and language. The code is the source of truth.

## Construction over validation

- Construct a structured value when one part of it can vary. Accept the variable part as input. Keep the fixed parts in code. Check whether construction can remove a state before you add validation for it.
- Validate external input before use. Match each check to the input's meaning and risk. A format check does not prove that a resource exists or that access is permitted.

## Decisions

- Make each decision in one place. Remove a guard or configuration site if another one enforces the same decision. No test can detect the loss of a duplicate guard because its removal changes no behavior.

## Comments

- Use a comment to explain a reason that the code cannot express. The reason can be a constraint, a trade-off, or a non-obvious invariant. Do not use a comment to narrate code behavior or change history. Put change notes such as "removed X" and "now uses Y instead" in the commit message.

## Dependency injection

- Read dependencies through request-scoped application bindings. Do not store dependencies in mutable module-level state.

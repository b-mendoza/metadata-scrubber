# Code design

Use these principles in every service and language. Read each service's guides for the methods that its framework uses.

## Construction over validation

- Construct a structured value when one part of it can vary. Accept the variable part as input. Keep the fixed parts in code. For a fixed provider URL, accept the account identifier and construct the URL. For a fixed path, accept the name and construct the path. This design prevents configuration from representing a different destination. Delete the validator and rejection-case tests that guarded the removed state. Check whether construction can remove a state before you add validation for it.
- Require an opaque external identifier to be present and non-blank. A syntax check can show that a bucket name or account identifier matches a format. It cannot show that the value identifies the correct resource. The owning system checks the identifier on first use. Before you add stronger checks, check whether construction can remove the need for them. Stronger checks apply to inputs that control which destination receives trusted data, such as the host that receives credentials.

## Comments

- Use a comment to explain a reason that the code cannot express. The reason can be a constraint, a trade-off, or a non-obvious invariant. Do not use a comment to narrate code behavior or change history. Put change notes such as "removed X" and "now uses Y instead" in the commit message.

## Dependency injection

- Read dependencies through request-scoped application bindings. Do not store dependencies in mutable module-level state.

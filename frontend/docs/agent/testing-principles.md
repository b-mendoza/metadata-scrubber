# Testing Principles

## What to Test

- **Test our code's decisions, not upstream contracts.** Assert on branching logic, routing, configuration wiring, and transformations our code performs. Do not test behavior owned by dependencies (e.g., `URL` constructor throwing on invalid input, Vercel AI SDK throwing `NoObjectGeneratedError`).
- **Test current behavior, not hypothetical future logic.** If production code passes a value through unchanged, do not write tests asserting on that value. When transformation logic is added, add tests at that time.
- **Apply risk-based coverage.** Core business logic (routing, classification taxonomy, model selection) needs thorough testing. Simple pass-through, getters, and type-level guarantees need little or none.

## What Not to Test

- **Mock pass-through.** If a test sets a mock return value and asserts the result equals that value, it tests `return output` — not business logic. Remove these.
- **Type system duplication.** Do not use `expectTypeOf` to verify contracts that TypeScript's type annotations already enforce. If compilation passes, the type is correct.
- **Dependency internals.** Do not build test infrastructure (schemas, parsers) that mirrors the internal shape of third-party libraries. If the library changes internals, tests break with confusing errors even though production behavior is unchanged.

## How to Assert

- **Use `expect.objectContaining` for call assertions.** Assert only on the fields our code controls. Avoid parsing full call argument structures.
- **Import production constants instead of duplicating them.** When a test needs to verify a specific constant is used (model ID, system prompt), import it from the production module. This avoids string duplication drift and makes the test break intentionally when the constant changes.
- **Use inline object literals for test data.** Prefer `{ category: "invoice", confidence: 0.85 }` over builders or factories when the test data is simple. Builders add indirection without value when only a few tests use them.

## How to Organize

- **Group by behavior domain**, not by arbitrary codes. Use descriptive `describe` blocks: "MIME routing", "AI provider configuration", "error handling" — not "Group A", "Group B".
- **Name tests with behavior-first active voice.** Each test name should read as a sentence describing what the system does: `"routes PDF through the file content part"`, not `"C3: sends PDF as file content part with correct mimeType"`. No alphanumeric prefixes.
- **Classify tests by actual importance.** A test covering one of two branches in core routing logic is not an "edge case" — it is core behavior. Place it accordingly.

## Constants and Configuration as Tests

Some constants carry outsized risk:

- **Model ID (`CATEGORIZATION_MODEL`):** A model change can 10x API costs or silently degrade output quality. The test should assert the exact model string via the imported constant. Make it intentionally brittle — without agent evals, the test suite is the only line of defense against model behavior regression.
- **System prompt (`CATEGORIZATION_SYSTEM_PROMPT`):** Defines the classification taxonomy. Assert it is passed to the AI provider via the imported constant. This catches accidental deletion without breaking on intentional prompt edits.
- **Gateway URL / API key wiring:** Assert configuration is forwarded correctly to the provider factory. This is legitimate wiring verification.

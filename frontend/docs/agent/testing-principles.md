# Testing — frontend specifics

General testing principles (what to test, how to assert, how to organize) live in the [root testing guide](../../../docs/agent/testing.md) and apply here. This file covers only what is specific to this service's stack.

## Vitest / TypeScript

- Use `expect.objectContaining` for call assertions, matching only the fields our code controls.
- Do not use `expectTypeOf` to re-verify contracts TypeScript's annotations already enforce. If it compiles, the type is correct.

## Constants and configuration as tests

Some constants in this service carry outsized risk and warrant intentionally brittle tests:

- **Model ID (`CATEGORIZATION_MODEL`):** a model change can 10x API cost or silently degrade output quality. Assert the exact model string via the imported constant. Without agent evals, this test is the only line of defense against model behavior regression.
- **System prompt (`CATEGORIZATION_SYSTEM_PROMPT`):** defines the classification taxonomy. Assert it is passed to the AI provider via the imported constant; this catches accidental deletion without breaking on intentional prompt edits.
- **Gateway URL / API key wiring:** assert configuration is forwarded correctly to the provider factory. This is legitimate wiring verification.

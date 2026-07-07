# Testing — frontend specifics

General testing principles (what to test, how to assert, how to organize) live in the [root testing guide](../../../docs/agent/testing.md) and apply here. This file covers only what is specific to this service's stack.

## Vitest / TypeScript

- The runner is Vitest (`pnpm run test`), configured in `vitest.config.ts`, with `@testing-library/react` for component tests and shared render helpers under `src/tests/utils/renderers/`.
- Use `expect.objectContaining` for call assertions, matching only the fields our code controls.
- Do not use `expectTypeOf` to re-verify contracts TypeScript's annotations already enforce. If it compiles, the type is correct.

## High-value targets in this service

Per the root guide's risk-based coverage rule, the logic most worth testing here today:

- Upload validation in `src/routes/api/upload.ts` — size and MIME acceptance/rejection branches.
- Environment parsing and the bindings invariant in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Wizard constants wiring (`MAX_FILE_SIZE_BYTES`, `UPLOADABLE_MIME_TYPES`) — import the production constants in assertions rather than duplicating the values.

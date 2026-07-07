# Testing — frontend specifics

General testing principles (what to test, how to assert, how to organize) live in the [root testing guide](../../../docs/agent/testing.md) and apply here. This file covers guidance specific to this service's stack. The current state of the suite (runner configuration, coverage status, high-value targets) lives in the short-lived [architecture reference](../architecture.md).

## Vitest / TypeScript

- Use `expect.objectContaining` for call assertions, matching only the fields our code controls.
- Do not use `expectTypeOf` to re-verify contracts TypeScript's annotations already enforce. If it compiles, the type is correct.
- Prefer the suite's shared render helpers for component tests over ad-hoc render setup, so provider wiring stays in one place.

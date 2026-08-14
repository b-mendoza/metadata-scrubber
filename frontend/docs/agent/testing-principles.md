# Testing — frontend specifics

General testing principles (what to test, how to assert, how to organize) live in the [root testing guide](../../../docs/agent/testing.md) and apply here. This file covers guidance specific to this service's stack. The current state of the suite (runner configuration, coverage status, high-value targets) lives in the short-lived [architecture reference](../architecture.md).

## Vitest / TypeScript

- Use `expect.objectContaining` for call assertions. Match only the fields that our code controls.

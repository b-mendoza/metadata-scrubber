# Known Issues

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

This folder records dependency, tooling, and framework issues that affect local development or production builds.

## Active Issues

| Issue | Area | Status | Workaround |
| --- | --- | --- | --- |
| [`@tanstack/devtools-vite@0.7.0` production build syntax error](./tanstack-devtools-vite-0-7-0-build-syntax-error.md) | Build tooling | Resolved — fixed upstream; `0.8.3` installed | None (historical: pin `0.6.1`) |

## Entry format

Each entry in this folder records:

- The affected command or workflow.
- The observed symptom and error message.
- The suspected or confirmed root cause.
- The package versions involved.
- The current mitigation.
- Links to upstream issues, release notes, or local reproduction notes.

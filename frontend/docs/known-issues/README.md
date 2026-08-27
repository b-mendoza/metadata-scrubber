# Known issues

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

Use this directory to record dependency, tooling, and framework issues that affect local development or production builds.

## Issues

| Issue | Area | Status | Workaround |
| --- | --- | --- | --- |
| [`@tanstack/devtools-vite@0.7.0` production build syntax error](./tanstack-devtools-vite-0-7-0-build-syntax-error.md) | Build tooling | Resolved. TanStack Devtools maintainers fixed the issue. We use `0.8.3`. | None. We used a `0.6.1` pin before the fix. |
| [`neverthrow@8.2.0` must-use lint compatibility](./neverthrow-must-use-lint-compatibility.md) | Lint tooling | Open. The available rules do not cover every `Result` form. | Enable `checkThenables` for `no-floating-promises`. Review the forms that lint does not catch. |

## Entry format

Each entry in this directory records:

- The affected command or workflow.
- The observed symptom and error message.
- The suspected or confirmed root cause.
- The package versions involved.
- The current workaround.
- Links to upstream issues, release notes, or local reproduction notes.

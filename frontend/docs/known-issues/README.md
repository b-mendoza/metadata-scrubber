# Known issues

> **Factual reference.** This file records observed dependency and tooling issues. Update it when its evidence changes. The code is the source of truth. If this document and the code disagree, the code wins.

This directory records dependency, tooling, and framework issues that affect local development or production builds. These entries do not prescribe implementation patterns.

## Issues

| Issue | Area | Status | Workaround |
| --- | --- | --- | --- |
| [`@tanstack/devtools-vite@0.7.0` production build syntax error](./tanstack-devtools-vite-0-7-0-build-syntax-error.md) | Build tooling | Resolved. TanStack Devtools maintainers fixed the issue. We use `0.8.5`. | None. We used a `0.6.1` pin before the fix. |
| [`neverthrow@8.2.0` must-use lint compatibility](./neverthrow-must-use-lint-compatibility.md) | Lint tooling | Open. The available rules do not cover every `Result` form. | Thenable checks cover bare `ResultAsync` values. No complete workaround is recorded. |

## Entry format

Record the observed failure, the tested versions, and the evidence. Distinguish a confirmed cause from a suspected cause. Record the current status.

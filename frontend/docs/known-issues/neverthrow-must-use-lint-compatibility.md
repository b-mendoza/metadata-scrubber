# `neverthrow` must-use lint compatibility

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Summary

The project uses `neverthrow@8.2.0`.

We evaluated `eslint-plugin-neverthrow@1.1.4` and rejected it. Its published must-use rule does not support the current ESLint API. The project does not install this plugin.

## Evaluated versions

| Package                    | Version  | Result                  |
| -------------------------- | -------- | ----------------------- |
| `neverthrow`               | `8.2.0`  | In use.                 |
| `eslint`                   | `9.39.5` | In use.                 |
| `typescript-eslint`        | `8.67.0` | In use.                 |
| `oxlint`                   | `1.79.0` | In use.                 |
| `eslint-plugin-neverthrow` | `1.1.4`  | Evaluated and rejected. |

## Current lint coverage

`@typescript-eslint/no-floating-promises` with `checkThenables: true` catches a bare, unawaited `ResultAsync`.

Oxlint runs the active copy of this rule. Active Oxlint enforcement requires the `checkThenables` option in `.oxlintrc.json`.

No lint rule catches a discarded synchronous `Result`.

No lint rule catches an awaited `ResultAsync` when code ignores its inner `Result`.

Code review must check both forms.

## Revisit criteria

Revisit this entry when `eslint-plugin-neverthrow` supports the current ESLint API. Also revisit it when another lint rule covers the two forms that code review must now check.

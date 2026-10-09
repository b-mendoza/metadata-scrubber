# `neverthrow` must-use lint compatibility

> **Factual reference.** This file records an observed tool issue. Update it when its evidence changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Summary

The project uses `neverthrow@8.2.0`.

We evaluated `eslint-plugin-neverthrow@1.1.4` and rejected it. Its published must-use rule failed against the ESLint API in that evaluation. The project does not install this plugin.

## Evaluated versions

These versions were used in the recorded evaluation. They do not list the current dependency versions.

| Package                    | Version  | Result                  |
| -------------------------- | -------- | ----------------------- |
| `neverthrow`               | `8.2.0`  | Evaluated.              |
| `eslint`                   | `9.39.5` | Evaluated.              |
| `typescript-eslint`        | `8.67.0` | Evaluated.              |
| `oxlint`                   | `1.79.0` | Evaluated.              |
| `eslint-plugin-neverthrow` | `1.1.4`  | Evaluated and rejected. |

## Current lint coverage

`@typescript-eslint/no-floating-promises` with `checkThenables: true` catches a bare, unawaited `ResultAsync`.

Oxlint runs the active copy of this rule. `.oxlintrc.json` enables its `checkThenables` option.

No lint rule catches a discarded synchronous `Result`.

No lint rule catches an awaited `ResultAsync` when code ignores its inner `Result`.

## Revisit criteria

Recheck this reference when its evidence or dependencies change.

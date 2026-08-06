# Question Manifest Builder Rules

Read this file after the critique report is validated and before building the manifest. These rules are static so the subagent definition can stay compact until assembly time.

## User-Surfacing Gate

Apply this gate before inventory or ordering. An item can enter `Questions For Now` only when its severity is `HIGH` or a future severity explicitly above `HIGH`. Items below that threshold stay out of the developer-facing question loop.

For critique-report items, use the report's severity unless the item documents unresolved contradictory current sources. Evidence-conflict items are user-facing and should be normalized to `HIGH` in the manifest row even if the report forgot to uplift them.

For plan-derived assumptions, open questions, validation failures, and task questions, assign a severity before including them. Use `HIGH` only when the item blocks execution, invalidates a core assumption, changes user impact, or creates a material architecture, security, performance, or maintainability risk.

Do not put `MEDIUM` or `LOW` items in `Deferred Questions` merely to keep them visible. Deferred means a `HIGH` or higher item belongs to a later task. `Resolved Irrelevant` means the item is no longer applicable. Keep below-threshold items in the critique artifact and optionally summarize their count in `## Manifest Summary`.

## Upfront Inventory

In `MODE=upfront`, consider these candidate sources, then apply the user-surfacing gate:

- Problem-framing critique items from the critique report
- Technology critique items from the critique report
- Cross-cutting open questions from the task plan
- Architectural assumptions from the task plan
- Validation `FAIL` items from the task plan
- Task 1 questions from the task plan

Collect these as deferred only when they meet the user-surfacing gate and belong to a later task:

- Task 2+ questions
- Task 2+ assumptions that should not be resolved yet
- New future-task questions surfaced by the critique report

In upfront mode, `Irrelevant` is normally `0` because future-task items are deferred instead of marked irrelevant. Keep the `## Resolved Irrelevant` section in the output and leave it empty unless a specific item is no longer applicable.

## Critique Inventory

In `MODE=critique`, consider these candidate sources, then apply the user-surfacing gate:

- Technology critique items for the current task
- User-impact critique items for the current task
- Deferred questions for `TASK_NUMBER` that still matter
- Current-task assumptions or open questions still unresolved

Collect these as irrelevant:

- Deferred questions already answered elsewhere in the plan
- Deferred questions invalidated by the current-task artifacts
- Deferred questions whose premise is no longer true

## Ordering

For `MODE=upfront`, order items like this:

1. Problem-framing `HIGH` or higher severity
2. Validation `FAIL` items that are `HIGH` or higher severity
3. Technology critique `HIGH` or higher severity
4. Architectural assumptions that are `HIGH` or higher severity
5. Cross-cutting questions that are `HIGH` or higher severity
6. Task 1 questions that are `HIGH` or higher severity
7. Dependency risks that are `HIGH` or higher severity

For `MODE=critique`, order items like this:

1. Critique `HIGH` or higher severity
2. User-impact `HIGH` or higher severity
3. Current-task assumptions or open questions that are `HIGH` or higher severity
4. Remaining deferred questions that are `HIGH` or higher severity

## Compact Briefs

For each item in the manifest, produce a short brief containing only what the conversational skill needs:

- `Item ID`
- `Category`
- `Severity`
- `Model` (`A` or `B`)
- `Skippable` (`Yes` or `No`)
- `Affected tasks`
- `Original decision or question`
- `Critique summary or context`
- `Fallback/default`

If an item is user-facing because of contradictory current sources, include the conflict in `Critique summary or context` so the conversation layer asks the developer to choose deliberately.

Do not copy entire artifact sections into the manifest.

## Model and Skippable Derivation

`Model` and `Skippable` are closed-value fields the conversation layer routes on directly. Derive both for every surfaced row; never leave either blank and never emit a third value.

A row is a **hard gate** when all three hold: `MODE=upfront`, the category is `Problem framing`, and the severity is `HIGH`.

| Row                            | `Model` | `Skippable` |
| ------------------------------ | ------- | ----------- |
| Hard gate                      | `A`     | `No`        |
| Any other surfaced upfront row | `B`     | `Yes`       |
| Any critique-mode row          | `B`     | `Yes`       |

Every `MODE=critique` row uses `Model=B`. The Tier 3 staged-reveal flow runs only in upfront mode, so critique mode never emits `Model=A`.

Because only `HIGH` items are surfaced, every upfront problem-framing row that reaches the manifest is a hard gate.

## Item IDs

Preserve critique report IDs exactly:

- `PF<n>` for problem-framing items
- `TC<n>` for technology critique items
- `UI<n>` for user-impact items

Use deterministic IDs for plan-derived items:

- `A<n>` for assumptions
- `CQ<n>` for cross-cutting questions
- `V<n>` for validation items
- `TQ-<task>-<n>` for task questions
- `DQ-<task>-<n>` for deferred questions

Once assigned, keep the same `Item ID` throughout the manifest so the conversation layer and `decision-recorder` can reuse it unchanged.

## Category Labels

Use human-readable labels that map directly to `decision-recorder` categories.

| Manifest label             | Recorder category |
| -------------------------- | ----------------- |
| `Problem framing`          | `problem-framing` |
| `Critique`                 | `critique`        |
| `User impact`              | `user-impact`     |
| `Cross-cutting`            | `cross-cutting`   |
| `Assumption`               | `assumption`      |
| `Architectural assumption` | `assumption`      |
| `Task question`            | `task-question`   |
| `Validation`               | `validation`      |

# Clarification Contracts

> Read this file when validating inputs, deriving subagent handoffs, or checking which orchestration artifacts this skill may update.
>
> **Reminder:** This file is the operational contract. Conceptual background lives behind URLs in `./external-sources.md`.

## Input Preconditions

The main task plan must exist at `docs/<TICKET_KEY>-tasks.md`.

The main plan should contain these sections:

| Section | Used for |
| --- | --- |
| `## Ticket Summary` or `## Issue Summary` | Platform-native summary section consumed upstream; either heading satisfies this contract |
| `## Problem Framing` | Tier 3 hard-gate questions and user-impact context |
| `## Assumptions and Constraints` | Assumptions to confirm, revise, or defer |
| `## Cross-Cutting Open Questions` | Plan-wide blocking questions |
| `## Tasks` | Task-specific questions and assumptions |
| `## Validation Report` | Validation `FAIL` and `WARN` items |
| `## Dependency Graph` | Impact mapping and downstream task references |

Additional upstream artifacts:

| Mode | Required artifacts |
| --- | --- |
| `upfront` | `docs/<KEY>-stage-1-detailed.md`, `docs/<KEY>-stage-2-prioritized.md` |
| `critique` | `docs/<KEY>-task-<N>-brief.md`, `docs/<KEY>-task-<N>-execution-plan.md`, `docs/<KEY>-task-<N>-test-spec.md`, `docs/<KEY>-task-<N>-refactoring-plan.md` |

If a required artifact is missing, let the relevant subagent return its parseable `BLOCKED`, `FAIL`, or `WARN` verdict instead of reading raw files inline.

## Derived Subagent Inputs

Derive these handoff values from the top-level inputs.

| Dispatch target | Derived inputs |
| --- | --- |
| `critique-analyzer` | `MAIN_PLAN_FILE`, `ARTIFACTS`, `CRITIQUE_REPORT_FILE`, `PRIOR_DECISIONS_FILE`, `PRIOR_DECISIONS_KIND`, and in `MODE=critique` `TASK_NUMBER` |
| `question-manifest-builder` | `PLAN_FILE`, `CRITIQUE_REPORT_FILE`, and in `MODE=critique` `TASK_NUMBER` plus `CURRENT_TASK_ARTIFACTS` |
| `decision-recorder` | `ITERATION`, `DECISIONS`, optional `DEFERRED_QUESTIONS`, optional `IMPLEMENTATION_UPDATES`, and in `MODE=critique` `TASK_NUMBER`, `TASK_TITLE`, plus `RESOLVED_IRRELEVANT` |

### Upfront Mode Paths

Use these exact paths for `MODE=upfront`:

| Value | Path or value |
| --- | --- |
| `MAIN_PLAN_FILE` | `docs/<KEY>-tasks.md` |
| `ARTIFACTS` | `docs/<KEY>-stage-1-detailed.md`, `docs/<KEY>-stage-2-prioritized.md` |
| `CRITIQUE_REPORT_FILE` | `docs/<KEY>-upfront-critique.md` |
| `PRIOR_DECISIONS_FILE` | `docs/<KEY>-tasks.md` |
| `PRIOR_DECISIONS_KIND` | `main-log` |

### Critique Mode Paths

Use these exact paths for `MODE=critique`:

| Value | Path or value |
| --- | --- |
| `MAIN_PLAN_FILE` | `docs/<KEY>-tasks.md` |
| `ARTIFACTS` and `CURRENT_TASK_ARTIFACTS` | `docs/<KEY>-task-<N>-brief.md`, `docs/<KEY>-task-<N>-execution-plan.md`, `docs/<KEY>-task-<N>-test-spec.md`, `docs/<KEY>-task-<N>-refactoring-plan.md` |
| `CRITIQUE_REPORT_FILE` | `docs/<KEY>-task-<N>-critique.md` |
| `PRIOR_DECISIONS_FILE` | `docs/<KEY>-task-<N>-decisions.md` |
| `PRIOR_DECISIONS_KIND` | `per-task` |

If the critique-mode decisions file does not exist yet, `critique-analyzer` treats it as an empty prior-decisions source.

## Output Artifacts

This skill updates orchestration artifacts only. It does not produce implementation code.

| Artifact | Required result |
| --- | --- |
| `docs/<KEY>-upfront-critique.md` or `docs/<KEY>-task-<N>-critique.md` | Full critique report written before manifest assembly so later steps consume the artifact path instead of the full report body |
| `docs/<KEY>-tasks.md` updates | Main plan updated so downstream execution consumes resolved decisions instead of open ambiguity |
| `## Decisions Log` rows | Durable audit trail for plan-wide and task-level clarification decisions |
| Deferred question tags | Later critique-mode runs can identify which questions must be revisited later |
| `docs/<KEY>-task-<N>-decisions.md` | Critique-mode record of task-level decisions for re-planning and execution |
| `RE_PLAN_NEEDED` in the final summary | Signals whether planning should be re-run before execution |
| `BLOCKERS_PRESENT` in the final summary | Signals that clarification ended with unresolved items and execution must stop |
| `Accepted decisions summary` in upfront-mode final summaries | Parent orchestrators pass accepted decisions back into plan rework |
| `Decisions file` in critique-mode final summaries | Parent orchestrators pass the per-task decisions artifact into task rework |

These are orchestration artifacts. Preserve them for resumability and keep them out of version control unless a parent workflow explicitly defines a different artifact lifecycle.

## Final Summary Contract

Every successful run ends with these fields in this order:

```text
- Critique artifact: <path>
- Files updated: <path list or ->
- RE_PLAN_NEEDED: <true|false>
- BLOCKERS_PRESENT: <true|false>
```

For `MODE=upfront`, append:

```text
- Accepted decisions summary: <concise summary or ->
```

For `MODE=critique`, append:

```text
- Decisions file: docs/<KEY>-task-<N>-decisions.md | -
```

If top-level inputs are invalid or a subagent blocks or fails, emit the same first four fields with `Files updated: -`, then the blocking pair, then the mode-specific retained field when a value is available:

```text
- Critique artifact: <path or ->
- Files updated: -
- RE_PLAN_NEEDED: <true|false>
- BLOCKERS_PRESENT: true
- Blocking verdict: <verdict>
- Reason: <reason>
- <Accepted decisions summary | Decisions file>: <value>
```

The mode-specific field is always last. Use `Critique artifact: -` when the run stops before a critique artifact is created. `SKILL.md` holds the Flag Transitions table that determines both flag values.

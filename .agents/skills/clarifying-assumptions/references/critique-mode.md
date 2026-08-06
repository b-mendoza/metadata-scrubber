# Critique Mode Playbook

> Read this file for `MODE=critique`. The skill loads it with `./design-thinking-mindset.md`; load `./conversation-protocol.md` only when Stage 4 starts.
>
> **Reminder:** Critique mode stays conversational for the developer, but subagents still own artifact reading, deferred-question filtering, and file writes.

Use `SKILL.md`'s escalation table for verdict routing. Load `./clarification-contracts.md` only when validating paths, sections, or derived handoffs. Fetch rationale from `./external-sources.md` only when the developer asks why this mode uses user-impact or technology critique.

## Stage 2 - Analyze Artifacts

Read `../subagents/critique-analyzer.md`, then dispatch `critique-analyzer` with:

| Input | Value |
| --- | --- |
| `MODE` | `critique` |
| `TICKET_KEY` | `<TICKET_KEY>` |
| `TASK_NUMBER` | `<TASK_NUMBER>` |
| `MAIN_PLAN_FILE` | `docs/<TICKET_KEY>-tasks.md` |
| `ARTIFACTS` | `docs/<TICKET_KEY>-task-<TASK_NUMBER>-brief.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-execution-plan.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-test-spec.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-refactoring-plan.md` |
| `CRITIQUE_REPORT_FILE` | `docs/<TICKET_KEY>-task-<TASK_NUMBER>-critique.md` |
| `PRIOR_DECISIONS_FILE` | `docs/<TICKET_KEY>-task-<TASK_NUMBER>-decisions.md` |
| `PRIOR_DECISIONS_KIND` | `per-task` |

The analyzer consults the per-task decisions file on every run. If the file does not exist yet, it treats the source as empty. When the file exists, it judges prior answers by substance rather than item ID or exact wording.

## Stage 3 - Build Manifest

Read `../subagents/question-manifest-builder.md`, then dispatch `question-manifest-builder` with:

| Input | Value |
| --- | --- |
| `MODE` | `critique` |
| `TICKET_KEY` | `<TICKET_KEY>` |
| `TASK_NUMBER` | `<TASK_NUMBER>` |
| `PLAN_FILE` | `docs/<TICKET_KEY>-tasks.md` |
| `CURRENT_TASK_ARTIFACTS` | `docs/<TICKET_KEY>-task-<TASK_NUMBER>-brief.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-execution-plan.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-test-spec.md`, `docs/<TICKET_KEY>-task-<TASK_NUMBER>-refactoring-plan.md` |
| `CRITIQUE_REPORT_FILE` | `docs/<TICKET_KEY>-task-<TASK_NUMBER>-critique.md` |

The manifest builder applies the `HIGH` or higher user-surfacing gate, then returns the same three-way shape used in upfront mode: questions for now, deferred questions, and resolved irrelevant items. A zero-item manifest is valid.

## Stage 4 - Clarify Inline

Load `./conversation-protocol.md` and follow its preview, turn, response, and recording rules.

Critique-specific rules:

1. Every item uses `Model=B`; do not run the Tier 3 Model A flow.
2. Resolve only current-task critique, user-impact, assumption, and deferred-question items.
3. If a deferred question is clearly obsolete, do not ask it; rely on the manifest builder's `Resolved Irrelevant` list.
4. Follow the manifest `Skippable` field. Items surfaced as non-skippable stay non-skippable.

## Stage 5 - Record Decisions

Read `../subagents/decision-recorder.md`, then dispatch `decision-recorder` with:

| Input | Value |
| --- | --- |
| `TICKET_KEY` | `<TICKET_KEY>` |
| `MODE` | `critique` |
| `TASK_NUMBER` | `<TASK_NUMBER>` |
| `TASK_TITLE` | task title from the manifest |
| `ITERATION` | `<ITERATION or 1>` |
| `DECISIONS` | resolved decisions from Stage 4 |
| `RESOLVED_IRRELEVANT` | items marked no longer applicable |
| `DEFERRED_QUESTIONS` | new future-task questions created during discussion, if any |
| `IMPLEMENTATION_UPDATES` | implementation-note edits caused by revised decisions |

In critique mode, `decision-recorder` creates or updates `docs/<TICKET_KEY>-task-<TASK_NUMBER>-decisions.md` and updates the main task plan. After it returns, use `./conversation-protocol.md` to present the final summary, including the `Decisions file:` retained by the parent orchestrator.

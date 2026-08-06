# Upfront Mode Playbook

> Read this file for `MODE=upfront`. The skill loads it with `./design-thinking-mindset.md`; load `./conversation-protocol.md` only when Stage 4 starts.
>
> **Reminder:** The conversation layer does not read or edit the plan directly. Subagents read artifacts, assemble the manifest, and write file updates.

Use `SKILL.md`'s escalation table for verdict routing. Load `./clarification-contracts.md` only when validating paths, sections, or derived handoffs. Fetch rationale from `./external-sources.md` only when the developer asks why this mode uses problem-before-solution questioning.

## Stage 2 - Analyze Artifacts

Read `../subagents/critique-analyzer.md`, then dispatch `critique-analyzer` with:

| Input | Value |
| --- | --- |
| `MODE` | `upfront` |
| `TICKET_KEY` | `<TICKET_KEY>` |
| `MAIN_PLAN_FILE` | `docs/<TICKET_KEY>-tasks.md` |
| `ARTIFACTS` | `docs/<TICKET_KEY>-stage-1-detailed.md`, `docs/<TICKET_KEY>-stage-2-prioritized.md` |
| `CRITIQUE_REPORT_FILE` | `docs/<TICKET_KEY>-upfront-critique.md` |
| `PRIOR_DECISIONS_FILE` | `docs/<TICKET_KEY>-tasks.md` |
| `PRIOR_DECISIONS_KIND` | `main-log` |

The analyzer consults the main `## Decisions Log` on every run, including `ITERATION=1`. It judges by substance, so changed wording or reassigned item IDs do not justify re-asking an already answered concern.

## Stage 3 - Build Manifest

Read `../subagents/question-manifest-builder.md`, then dispatch `question-manifest-builder` with:

| Input                  | Value                                   |
| ---------------------- | --------------------------------------- |
| `MODE`                 | `upfront`                               |
| `TICKET_KEY`           | `<TICKET_KEY>`                          |
| `PLAN_FILE`            | `docs/<TICKET_KEY>-tasks.md`            |
| `CRITIQUE_REPORT_FILE` | `docs/<TICKET_KEY>-upfront-critique.md` |

The manifest builder applies the `HIGH` or higher user-surfacing gate, then returns the ordered questions to ask now, questions to defer, and any warnings about malformed or missing sections. A zero-item manifest is valid.

## Stage 4 - Clarify Inline

Load `./conversation-protocol.md` and follow its preview, turn, response, and recording rules.

Upfront-specific rules:

1. `Model=A` applies only to Tier 3 problem-framing items.
2. Do not reveal `Model=A` per-item briefs before the developer answers.
3. Defer Task 2+ questions instead of resolving them during plan-wide clarification.
4. New questions for the current plan or Task 1 may be appended to the live manifest; future-task questions go to `DEFERRED_QUESTIONS`.

## Stage 5 - Record Decisions

Read `../subagents/decision-recorder.md`, then dispatch `decision-recorder` with:

| Input | Value |
| --- | --- |
| `TICKET_KEY` | `<TICKET_KEY>` |
| `MODE` | `upfront` |
| `ITERATION` | `<ITERATION or 1>` |
| `DECISIONS` | resolved decisions from Stage 4 |
| `DEFERRED_QUESTIONS` | all deferred questions from the manifest and discussion |
| `IMPLEMENTATION_UPDATES` | implementation-note edits caused by revised decisions |

`decision-recorder` owns file writes and validation. After it returns, use `./conversation-protocol.md` to present the final summary, including the `Accepted decisions summary:` retained by the parent orchestrator.

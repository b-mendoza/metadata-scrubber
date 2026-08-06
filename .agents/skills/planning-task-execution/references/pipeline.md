# Task-Execution Planning Pipeline

> Read this file when running the standard selected-task flow or a critique-triggered re-plan. This file owns stage order, status routing, targeted invalidation, and retry budgets.

`<KEY>` is derived by the active playbook and passed under the shared alias `TICKET_KEY`. Dispatch one subagent at a time, keep only summaries, and never change `TASK_NUMBER` during the run.

## Reference Handoff

Every subagent dispatch includes `PLAYBOOK_PATH`; pass `TICKET_KEY=<KEY>`, `TASK_NUMBER`, and the stage-specific artifact paths. Also pass the derived `INVOCATION_MODE` to `execution-prepper`. Each subagent defaults the shared bundled references below relative to its own file, so direct or minimal dispatches may omit them. When explicit payload values are required, use:

```text
PLAYBOOK_PATH: ../references/<platform>-playbook.md
PIPELINE_PATH: ../references/pipeline.md
DATA_CONTRACTS_PATH: ../references/data-contracts.md
ARTIFACT_TEMPLATES_PATH: ../references/artifact-templates.md
HANDOFF_FORMATS_PATH: ../references/handoff-formats.md
EXTERNAL_SOURCES_PATH: ../references/external-sources.md
```

A subagent reads `PLAYBOOK_PATH` first. It reads `EXTERNAL_SOURCES_PATH` only when the active playbook routes a public source that can change the current artifact decision, and reads `HANDOFF_FORMATS_PATH` only for summary examples or malformed-summary repair.

## Standard Pipeline

| Stage | Subagent | Required task inputs | Optional inputs | Result fields |
| --- | --- | --- | --- | --- |
| 1 | `execution-prepper` | `TICKET_KEY`, `TASK_NUMBER`, `INVOCATION_MODE` | `RE_PLAN`, `DECISIONS_FILE` | `PREP`, brief path, dependencies, questions |
| 2 | `execution-planner` | `TICKET_KEY`, `TASK_NUMBER`, `BRIEF_FILE` | `DECISIONS_FILE` | `PLAN`, plan path, recommended skills |
| 3 | `test-strategist` | `TICKET_KEY`, `TASK_NUMBER`, `BRIEF_FILE`, `PLAN_FILE` | `DECISIONS_FILE` | `TEST_SPEC`, spec path, framework |
| 4 | `refactoring-advisor` | `TICKET_KEY`, `TASK_NUMBER`, `BRIEF_FILE`, `PLAN_FILE`, `TEST_SPEC_FILE` | `DECISIONS_FILE` | `REFACTORING`, plan path, verdict |

Before dispatch, validate every required input artifact exists and carries the same `<KEY>` and `TASK_NUMBER`. After a `PASS`, validate the expected output path, owner, identity, and template headings before continuing.

## Stage Outcomes

Before routing, require `PREP: PASS` to pair with `Dependencies: Satisfied` and `Questions: Resolved`, and require every later `*: PASS` to pair with `Blockers: None`. Any contradictory readiness field makes the summary malformed; route it as `ERROR` and stop.

| Status returned | Coordinator action |
| --- | --- |
| `*: PASS` with consistent summary and valid artifact | Continue with the returned path |
| `*: PASS` with invalid or missing artifact | Enter the artifact-validation repair loop |
| `*: FAIL` | Stop and surface the dependency, unresolved question, ambiguity, behavior gap, or planning risk |
| `*: BLOCKED` | Stop and surface the missing prerequisite, selected-task section, or input artifact |
| `*: ERROR` | Stop and report the unexpected tool, filesystem, fetch, or parsing problem |
| Unknown or malformed | Treat as `ERROR`; do not infer a route from prose |

## Completion Report

After Stage 4 passes validation, return:

- Task number and title
- The four selected-task artifact paths
- One or two sentences on the recommended approach
- The number or shape of tests specified
- The refactoring verdict
- Exact `References fetched` URLs, or `none`
- Completion state

Then stop and return control to the caller. Do not increment `TASK_NUMBER`, select the next task, start critique, or begin implementation.

## Re-Plan Rules

Use targeted reruns instead of replaying the whole pipeline by default:

| Critique change | Rerun |
| --- | --- |
| Task scope, definition of done, resolved questions, or brief context | `execution-prepper` and every downstream subagent |
| Implementation approach, file strategy, user impact, or recommended skills | `execution-planner`, `test-strategist`, and `refactoring-advisor` |
| Test expectations only | `test-strategist`; rerun `refactoring-advisor` only if sequencing, setup, or test impact changes |
| Refactoring guidance only | `refactoring-advisor` alone |

Whenever a subagent is re-run:

- Preserve the original `TICKET_KEY` and `TASK_NUMBER`.
- Pass `DECISIONS_FILE` when critique produced it.
- Pass `RE_PLAN=true` when re-dispatching `execution-prepper` after critique.
- Let the owner read its existing artifact for deliberate updates.
- Overwrite only the owner's selected-task file.
- Rerun downstream owners whose artifacts depend on the changed output.

Maximum re-plan loops: 3. If unresolved high-severity concerns remain after the third loop, return `FAIL` with those concerns and stop.

## Artifact-Validation Repair Loop

When a stage returns `PASS` but its artifact fails a boundary check:

1. Identify the artifact owner and the exact failed condition.
2. Re-dispatch only that owner with narrow `REPAIR_FINDINGS` plus the minimum existing selected-task inputs it requires.
3. Preserve unrelated valid content and every other artifact.
4. Re-check only the failed condition and identity boundary before resuming.

Maximum repair attempts: 3 per stage. At the cap, return `ERROR` with the failed condition. A repair loop never widens mutation scope or changes tasks.

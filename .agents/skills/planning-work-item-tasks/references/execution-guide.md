# Execution Guide

Read this file for the normal planning path or after `re-plan-cycle.md` selects the earliest affected stage. `<KEY>` is always passed under the shared parameter name `TICKET_KEY`, even when its value is a GitHub issue slug.

> Keep raw snapshots and stage artifacts out of orchestrator context. Every subagent receives `PLAYBOOK_PATH` plus the reference paths it consumes. Bundled reference paths below are relative to the subagent file that reads them; workflow artifact paths under `docs/` are relative to the repository root.

## Normal Path

Run these gates in order:

1. `preflight`
2. Stage 1 producer
3. Stage 1 independent validation
4. Stage 2 producer
5. Stage 2 independent validation
6. Stage 3 producer and full 20-check report
7. Stage 3 independent validation
8. `postpipeline`
9. Return the handoff

## Gate Map

| Gate | Dispatch | Required output | On failure |
| --- | --- | --- | --- |
| `preflight` | `stage-validator` | Snapshot exists and matches the active playbook's exact heading list | Stop with `Failure category: PREFLIGHT` |
| Stage 1 | `task-planner`, then `stage-validator` | `PLAN: PASS`; Stage 1 gate passes | Retry only the Stage 1 producer on validator `FAIL`; stop on producer non-PASS or validator `ERROR` |
| Stage 2 | `dependency-prioritizer`, then `stage-validator` | `PRIORITIZATION: PASS`; Stage 2 gate passes | Retry only the Stage 2 producer on validator `FAIL`; stop on producer non-PASS or validator `ERROR` |
| Stage 3 | `task-validator`, then `stage-validator` | `TASK_VALIDATION: PASS`; Stage 3 gate passes | Retry only the Stage 3 producer on validator `FAIL`; stop on producer non-PASS or validator `ERROR` |
| `postpipeline` | `stage-validator` | Final section order, required fields, child mode, and deterministic branches pass | Redispatch Stage 3 on validator `FAIL`; stop on validator `ERROR` |

## Common Dispatch Paths

Choose one active playbook and pass the path below to every subagent:

```text
PLAYBOOK_PATH=../references/github-playbook.md
```

or

```text
PLAYBOOK_PATH=../references/jira-playbook.md
```

Bundled package paths under `references/` or `subagents/` are relative to the file that consumes them. Workflow artifact paths under `docs/` are relative to the repository root. Every payload also includes the exact `MUTATION_LIMITS` block from `SKILL.md`.

```text
OUTPUT_CONTRACT_PATH=../references/output-contract.md
VALIDATION_CHECKS_PATH=../references/validation-checks.md
TASK_PLANNING_GUIDE_PATH=../references/task-planning-guide.md
TASK_PLANNER_TEMPLATE_PATH=../references/task-planner-template.md
DEPENDENCY_GUIDE_PATH=../references/dependency-and-branch-guide.md
DEPENDENCY_TEMPLATE_PATH=../references/dependency-prioritizer-template.md
EXTERNAL_SOURCES_PATH=../references/external-sources.md
```

## Dispatch Payloads

### Preflight

Dispatch `stage-validator` with:

```text
TICKET_KEY=<KEY>
PLAYBOOK_PATH=../references/<platform>-playbook.md
VALIDATION_CHECKS_PATH=../references/validation-checks.md
OUTPUT_CONTRACT_PATH=../references/output-contract.md
EXTERNAL_SOURCES_PATH=../references/external-sources.md
STAGE=preflight
FILE_PATH=docs/<KEY>.md
```

### Stage 1 - Plan

Dispatch `task-planner` with:

```text
TICKET_KEY=<KEY>
PLAYBOOK_PATH=../references/<platform>-playbook.md
TASK_PLANNING_GUIDE_PATH=../references/task-planning-guide.md
TASK_PLANNER_TEMPLATE_PATH=../references/task-planner-template.md
OUTPUT_CONTRACT_PATH=../references/output-contract.md
EXTERNAL_SOURCES_PATH=../references/external-sources.md
INPUT_PATH=docs/<KEY>.md
OUTPUT_PATH=docs/<KEY>-stage-1-detailed.md
DECISIONS=<DECISIONS> only during a Stage 1 re-plan
VALIDATION_ISSUES=<issues list> only during a Stage 1 repair
```

Then dispatch `stage-validator` with the common validation paths, `STAGE=1`, and `FILE_PATH=docs/<KEY>-stage-1-detailed.md`.

### Stage 2 - Prioritize and Name Branches

Dispatch `dependency-prioritizer` with:

```text
TICKET_KEY=<KEY>
PLAYBOOK_PATH=../references/<platform>-playbook.md
DEPENDENCY_GUIDE_PATH=../references/dependency-and-branch-guide.md
DEPENDENCY_TEMPLATE_PATH=../references/dependency-prioritizer-template.md
OUTPUT_CONTRACT_PATH=../references/output-contract.md
EXTERNAL_SOURCES_PATH=../references/external-sources.md
INPUT_PATH=docs/<KEY>-stage-1-detailed.md
OUTPUT_PATH=docs/<KEY>-stage-2-prioritized.md
DECISIONS=<DECISIONS> only during a Stage 2 re-plan
VALIDATION_ISSUES=<issues list> only during a Stage 2 repair
```

Then dispatch `stage-validator` with the common validation paths, `STAGE=2`, and `FILE_PATH=docs/<KEY>-stage-2-prioritized.md`.

### Stage 3 - Validate Final Plan

Dispatch `task-validator` with:

```text
TICKET_KEY=<KEY>
PLAYBOOK_PATH=../references/<platform>-playbook.md
VALIDATION_CHECKS_PATH=../references/validation-checks.md
OUTPUT_CONTRACT_PATH=../references/output-contract.md
EXTERNAL_SOURCES_PATH=../references/external-sources.md
SNAPSHOT_PATH=docs/<KEY>.md
PLAN_PATH=docs/<KEY>-stage-2-prioritized.md
OUTPUT_PATH=docs/<KEY>-tasks.md
DECISIONS=<DECISIONS> only during a Stage 3 re-plan
VALIDATION_ISSUES=<issues list> only during Stage 3 or postpipeline repair
```

Then dispatch `stage-validator` with the common validation paths, `STAGE=3`, and `FILE_PATH=docs/<KEY>-tasks.md`.

### Postpipeline

Dispatch `stage-validator` with the common validation paths, `STAGE=postpipeline`, and `FILE_PATH=docs/<KEY>-tasks.md`.

## Structured Status Routing

| Returned status | Route |
| --- | --- |
| Producer `PASS` | Run that stage's independent validation gate |
| Producer `FAIL`, `BLOCKED`, or `ERROR` | Stop with that stage's failure category; do not reinterpret prose |
| `STAGE_VALIDATION: PASS` | Advance |
| `STAGE_VALIDATION: FAIL` at Stage 1, 2, 3, or postpipeline with budget remaining | Targeted producer repair |
| `STAGE_VALIDATION: FAIL` at preflight | Stop with `PREFLIGHT` |
| `STAGE_VALIDATION: ERROR` | Stop at the current gate |
| Malformed or unknown status | Treat as the current stage's terminal error |

## Targeted Retry Loop

The loop applies only to `STAGE_VALIDATION: FAIL` for Stage 1, Stage 2, Stage 3, or `postpipeline`.

1. Store only the validator's issue list.
2. Increment the failure counter for that exact gate.
3. If the counter is 3, stop with `PLANNING: FAIL`; do not start another repair.
4. Otherwise redispatch only the producer of the failing artifact with original inputs and `VALIDATION_ISSUES`.
5. Re-run only the failing independent gate.
6. For `postpipeline`, redispatch Stage 3, then rerun both Stage 3 and postpipeline validation.

Preflight failures, producer non-PASS statuses, validator errors, and malformed statuses are terminal for the current run.

# Task Loop - Phases 5-7

> Read this file when entering the per-task execution loop. For exact artifact checks, load `./data-contracts.md` and dispatch `artifact-validator`; do not inspect artifacts inline in the orchestrator. For background on context engineering or subagent isolation, fetch one URL from `./external-sources.md`. Load `./downstream-skills.md` only when you need phase-to-skill dispatch contract details.

Each task passes through Phase 5 (plan), Phase 6 (critique), and Phase 7 (kickoff + execute). If `progress-tracker` reports a mid-task resume point, skip task selection and re-enter at the reported phase for that task.

The active playbook's Phase Skill Map names the runtime skill for each phase. `<KEY>` below is the workflow key value passed under the parameter name `TICKET_KEY`; the active playbook defines its shape.

## Task Selection

Before entering the loop for a task:

1. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY` and `ACTION=read`.
2. Present remaining tasks with dependency, priority, and status metadata from the compact progress summary.
3. Let the user choose the task. Never auto-select.
4. Optionally gather independent pre-task context in parallel:

| Need                              | Dispatch to             |
| --------------------------------- | ----------------------- |
| Current work-item platform status | `status-checker`        |
| Working tree / branch state       | `codebase-inspector`    |
| Likely implementation touchpoints | `code-reference-finder` |
| Relevant docs or config           | `documentation-finder`  |

For `status-checker`, pass the workflow key under `TICKET_KEY`, the active `PLAYBOOK_PATH`, the narrowest useful `QUERY_TYPE` (`status` or `children` for task selection context), and any additional locator inputs required by the active playbook's `Inputs and Identifier` section. For GitHub, prefer `ISSUE_URL`; when it is unavailable, pass `OWNER`, `REPO`, and `ISSUE_NUMBER`. The playbook supplies transport and output template.

Do not initialize task progress during selection. Initialize it only after the Phase 5 precondition passes and only if the task does not already have a progress file.

## Phase 5 - Plan Task Execution

**Skill:** Named in the active playbook's Phase Skill Map row for Phase 5.

1. Announce Phase 5 for Task `<N>`.
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=5`, `DIRECTION=precondition`, `TASK_NUMBER=<N>`.
3. If the precondition passes and the task progress file does not exist, dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `ACTION=initialize_task`, `TASK_NUMBER=<N>`, and `TASK_TITLE=<title>`.
4. Invoke the downstream skill with the inputs named in the playbook's Phase Skill Map row for Phase 5.
5. Retain only the downstream completion summary: four artifact paths, approach summary, test coverage shape, and refactoring verdict.
6. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=5`, `DIRECTION=postcondition`, `TASK_NUMBER=<N>`.
7. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `ACTION=update_task`, `TASK_NUMBER=<N>`, `PHASE=5`, `STATUS=complete`, and a one-line planning summary.

**Gate:** Automatic. Proceed to Phase 6 when validation passes.

## Phase 6 - Clarify + Critique Execution Plan

**Skill:** `clarifying-assumptions` **Mode:** `critique`

1. Announce Phase 6 for Task `<N>` and critique iteration `<I>` (`1` on the first Phase 6 pass for that task).
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=6`, `DIRECTION=precondition`, `TASK_NUMBER=<N>`.
3. Invoke `clarifying-assumptions` with `MODE=critique`, `TICKET_KEY=<KEY>`, `TASK_NUMBER=<N>`, and `ITERATION=<I>`.
4. Let the downstream skill critique the Phase 5 planning artifacts and walk the user through critique items.
5. If `RE_PLAN_NEEDED=true` and `<I>` is below 3, re-dispatch Phase 5 with the workflow key, `TASK_NUMBER=<N>`, `RE_PLAN=true`, and `DECISIONS_FILE=docs/<KEY>-task-<N>-decisions.md`, then increment `<I>` and run Phase 6 again. If `<I>` is already 3, stop and surface the unresolved critique items. Maximum: 3 critique iterations per task.
6. After `RE_PLAN_NEEDED=false`, dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=6`, `DIRECTION=postcondition`, `TASK_NUMBER=<N>`.
7. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `ACTION=update_task`, `TASK_NUMBER=<N>`, `PHASE=6`, `STATUS=complete`, and a one-line critique summary.

**Gate:** First honor `BLOCKERS_PRESENT`. If it is `true`, stop before execution and surface the unresolved blockers.

If blockers are clear, ask:

```text
The execution plan for Task <N> has been critiqued and updated.
Ready to start execution kickoff and implementation? (y/n)
```

Phase 6 is critique-only: no implementation, kickoff, platform state mutation, or commit happens here.

## Phase 7 - Kick Off And Execute Task

**Skill:** Named in the active playbook's Phase Skill Map row for Phase 7.

1. Announce Phase 7 for Task `<N>`.
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=7`, `DIRECTION=precondition`, `TASK_NUMBER=<N>`.
3. Invoke the downstream skill with the inputs named in the playbook's Phase Skill Map row for Phase 7. Pass pre-task utility summaries only if the downstream skill explicitly accepts them.
4. Let the Phase 7 execution skill own kickoff, implementation, documentation, requirements verification, quality gates, and its internal fix cycles.
5. Interpret the returned `FINAL_TASK_REPORT` status:
   - `COMPLETE`: Phase 7 succeeded for the selected task.
   - `BLOCKED`: stop the task, surface the blocker, and record a Phase 7 resume point.
   - `STOPPED_FOR_USER_INPUT`: pause Phase 7, surface the exact decision needed, and do not mark the task complete.
   - `ESCALATED`: load `./error-handling.md` and present the accumulated verifier or reviewer findings to the user.
6. Retain the report's completion/blocker verdict, quality-gate summary, implementation artifact summary, retry counts, and next required action.
7. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `ACTION=update_task`, `TASK_NUMBER=<N>`, `PHASE=7`, `STATUS=<complete | active | failed | skipped>`, and a one-line summary based on the downstream outcome.

Use `STATUS=complete` only for `FINAL_TASK_REPORT` status `COMPLETE`. Use `STATUS=active` for `STOPPED_FOR_USER_INPUT` so the task remains resumable. Use `STATUS=failed` for `BLOCKED`, `ESCALATED`, or downstream `ERROR` unless the user explicitly chooses to skip or accept an incomplete task.

There is no orchestrator-level Phase 7 postcondition validator.

## Loop Continuation

After Phase 7 completes for a task:

1. Return to Task Selection.
2. Present remaining tasks to the user.
3. Continue only after the user selects the next task or asks to stop.

## Final Summary

When all tasks are complete or the user stops, dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `ACTION=read`, and present a compact workflow summary:

```text
## Workflow Summary - <KEY>

| Phase | Status | Key outcome |
| ----- | ------ | ----------- |
| 1 | Complete | Work item fetched |
| 2 | Complete | Tasks planned |
| 3 | Complete | Questions resolved and plan critiqued |
| 4 | Complete | Tasks linked to platform child items |
| 5-7 | Complete | Tasks planned, critiqued, kicked off, and executed |

Per-task detail: `docs/<KEY>-task-<N>-progress.md`
Artifacts: `docs/<KEY>*`
```

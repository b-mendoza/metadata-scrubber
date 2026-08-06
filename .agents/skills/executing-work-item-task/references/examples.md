# Execution Examples

> Load only for a dispatch round trip or targeted-fix example. The active playbook supplies all platform-specific values and actions.

## Happy Path

Input: `TICKET_KEY=<KEY>`, `TASK_NUMBER=3`, `PLAYBOOK_PATH=../references/<platform>-playbook.md`

1. Validate all Phase 1-6 artifacts and selected-task readiness.
2. Assess tracker capability. Record optional unavailable actions as skips; block only a mandatory unavailable action.
3. Dispatch `execution-starter` with `PLAYBOOK_PATH` and relative reference paths. It enters the planner branch and returns `KICKOFF_REPORT -> READY`.
4. Dispatch `task-executor`; receive `EXECUTION_REPORT -> COMPLETE`.
5. Dispatch `documentation-writer` with `Mode=UPDATE_TRACKING`. It documents the Category B delta and updates Category A status to pending verification; it performs no final tracker completion action.
6. Dispatch `requirements-verifier`; receive `PASS`.
7. Run clean-code, architecture, and security in order; receive non-blocking verdicts.
8. Dispatch `documentation-writer` with `Mode=FINALIZE_TRACKER` and all passing gate reports. It applies eligible playbook-defined completion actions or records optional skips.
9. Return `FINAL_TASK_REPORT -> COMPLETE` for Task 3 and stop.

## Optional Tracker Unavailable

1. Capability assessment finds the active playbook's tracker transport missing or unauthenticated.
2. The approved artifacts make both kickoff and completion tracker actions optional.
3. Record kickoff tracker result `skipped`; continue local branch entry, implementation, documentation, requirements, and quality gates.
4. At finalization, record completion tracker result `skipped` with the same capability reason.
5. `COMPLETE` remains valid because the skipped actions were optional and every local requirement and quality gate passed.

## Mandatory Tracker Unavailable

1. The approved brief requires a specific kickoff tracker action.
2. Capability assessment shows the transport cannot perform it.
3. Do not treat transport as a universal precondition, but block this run because this exact planned action is mandatory.
4. Return `FINAL_TASK_REPORT -> BLOCKED` with the capability and recovery action.

## Requirements Fix Path

1. `requirements-verifier` returns `FAIL` for one in-scope DoD gap.
2. Build a requirements fix brief and increment only `requirements_fix_attempts` to 1.
3. Re-dispatch `task-executor` within that fix scope.
4. Re-dispatch `documentation-writer` with `Mode=UPDATE_TRACKING`.
5. Re-run `requirements-verifier` only.
6. Preserve all prior results and the other three counters at 0.

## Quality-Gate Fix Path

1. Security returns `NEEDS FIXES`; earlier requirements, clean-code, and architecture results are already non-blocking.
2. Build a security-only fix brief and increment only `security_fix_attempts`.
3. Re-dispatch execution and `UPDATE_TRACKING`, then security only.
4. Do not rerun passed gates or discard their reports.
5. If the third security fix attempt still returns `NEEDS FIXES`, return `ESCALATED` with accumulated security findings and all four counters.

## Decision Stop Path

1. `task-executor` returns `NEEDS_CONTEXT` for a material scope decision.
2. With no new answer, fix brief, or explicit decision, do not repeat execution.
3. Return `STOPPED_FOR_USER_INPUT` with the exact decision needed and a resumable current step.

## Finalization Guard

1. `documentation-writer` completes `UPDATE_TRACKING`.
2. One quality gate is missing or failing.
3. Do not perform any playbook-defined final completion action.
4. Stop or enter the targeted gate fix path. `FINALIZE_TRACKER` remains deferred.

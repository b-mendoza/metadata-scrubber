# Execution Pipeline

> This is the ordered Phase 7 runbook. `./contracts.md` owns readiness, mutation limits, lifecycle, and dispatch handoffs. The active playbook owns every platform-specific transport, noun, reference, and tracker action.

## Run State

Before dispatch, initialize or restore:

```text
requirements_fix_attempts: 0..3
clean_code_fix_attempts: 0..3
architecture_fix_attempts: 0..3
security_fix_attempts: 0..3
executor_context_retries_for_current_blocker: 0..3
passed_results: <all completed phase and gate reports>
current_step: <readiness | kickoff | execution | documentation | requirements | clean-code | architecture | security | tracker-finalization>
```

Counters are independent. Recovery must preserve every passed result and all counter values; never restart the whole pipeline merely because a later step failed.

## Standard Phase Cycle

For every stage: announce the stage, validate its preconditions, dispatch one subagent with `PLAYBOOK_PATH` and reference paths, validate the returned status, retain only the structured report, then advance, repair, stop, or escalate.

1. **Validate readiness.**
   - Read `./contracts.md` and the active playbook.
   - Confirm all Phase 1-6 artifacts, selected task, dependencies, decisions, branch, critique approval, tracker-capability policy, and `MUTATION_LIMITS`.
   - Stop on missing, contradictory, unsafe, or ambiguous prerequisites.

2. **Kick off execution.**
   - Dispatch `execution-starter` with the common fields, snapshot path, task plan path, brief path, `CONTRACTS_PATH`, `KICKOFF_TEMPLATE_PATH`, and `EXTERNAL_SOURCES_PATH`.
   - Kickoff enters the planner branch and applies only eligible playbook-defined startup actions.
   - `READY` advances. `BLOCKED` or `ERROR` enters recovery.

3. **Implement the task.**
   - Dispatch `task-executor` with approved planning artifacts, decisions, optional critique, any targeted fix brief, the prior execution report when resuming, `EXECUTION_TEMPLATE_PATH`, and `EXTERNAL_SOURCES_PATH`.
   - `COMPLETE` advances. `NEEDS_CONTEXT`, `BLOCKED`, or `ERROR` enters recovery.
   - A repeated context blocker may be re-dispatched at most three times and only after the missing context or decision changes.

4. **Document and update local tracking.**
   - Dispatch `documentation-writer` with `Mode=UPDATE_TRACKING`, the execution report, brief path, task plan path, `DOCUMENTATION_TEMPLATE_PATH`, and `EXTERNAL_SOURCES_PATH`.
   - Add only high-value in-code documentation to changed Category B files and standalone documentation explicitly required by the selected task.
   - Update Category A task tracking to pending verification/finalization.
   - Do not perform any playbook-defined final completion action in this mode.
   - `COMPLETE` advances. `BLOCKED` or `ERROR` enters recovery.

5. **Verify requirements.**
   - Dispatch `requirements-verifier` with brief path, test spec path, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT`, `REQUIREMENTS_TEMPLATE_PATH`, and `EXTERNAL_SOURCES_PATH`.
   - `PASS` advances to clean-code review.
   - `BLOCKED` or `ERROR` enters recovery.
   - `FAIL` with ordinary in-scope gaps enters the requirements fix cycle.

6. **Run clean-code review.**
   - Dispatch `clean-code-reviewer` with its contracted artifact/report inputs, `REVIEW_POLICY_PATH`, `REVIEW_TEMPLATE_PATH`, and `EXTERNAL_SOURCES_PATH`.
   - `PASS` or `PASS WITH SUGGESTIONS` advances to architecture.
   - `NEEDS FIXES` enters the clean-code fix cycle.
   - `BLOCKED` or `ERROR` enters recovery.

7. **Run architecture review.**
   - Dispatch `architecture-reviewer` with its contracted artifact/report inputs and reference paths.
   - `PASS` or `PASS WITH SUGGESTIONS` advances to security.
   - `NEEDS FIXES` enters the architecture fix cycle.
   - `BLOCKED` or `ERROR` enters recovery.

8. **Run security audit.**
   - Dispatch `security-auditor` with its contracted artifact/report inputs and reference paths.
   - `PASS` or `PASS WITH ADVISORIES` advances to the finalization gate.
   - `NEEDS FIXES` enters the security fix cycle.
   - `BLOCKED` or `ERROR` enters recovery.

9. **Check finalization eligibility.**
   - Require requirements `PASS`, clean-code non-blocking, architecture non-blocking, and security non-blocking.
   - If any required result is missing, failing, malformed, or unresolved, do not dispatch finalization.

10. **Finalize tracking.**
    - Dispatch `documentation-writer` with `Mode=FINALIZE_TRACKER`, the latest `EXECUTION_REPORT`, prior `DOCUMENTATION_REPORT`, all four passing gate reports, brief path, task plan path, playbook path, and reference paths.
    - It updates final local completion metadata and performs only eligible playbook-defined completion actions.
    - Optional unavailable tracker actions are explicit skips. Mandatory unavailable actions return `BLOCKED`.
    - `COMPLETE` advances to reporting. `BLOCKED` or `ERROR` enters recovery.

11. **Report and stop.**
    - Load `./template-final-report.md` only now.
    - Include all preserved results, independent counters, changed files, Category A paths, playbook-defined tracker actions/skips, blockers, and next action.
    - Return one terminal status and stop after the requested `TASK_NUMBER`.

## Requirements Fix Cycle

On verifier `FAIL` for ordinary in-scope gaps:

1. If `requirements_fix_attempts >= 3`, return `ESCALATED` with accumulated gaps.
2. Build a concise fix brief from only verifier gaps.
3. Increment `requirements_fix_attempts`.
4. Re-dispatch `task-executor` with original planning artifacts plus the fix brief and previous execution report.
5. Re-dispatch `documentation-writer` in `UPDATE_TRACKING` for the new Category B delta.
6. Re-run `requirements-verifier` only.
7. On `PASS`, resume at clean-code review; preserve all counters.

A verifier `BLOCKED` for ambiguity, conflicting artifacts, missing context, missing capability, or probable planning error is not a fix-cycle `FAIL`; stop for the smallest decision or recovery action.

## Quality-Gate Fix Cycles

Each gate owns its own counter. On `NEEDS FIXES`:

1. If that gate's counter is already 3, return `ESCALATED` with accumulated findings.
2. Build a fix brief from only that gate's blocking findings.
3. Increment only that gate's counter.
4. Re-dispatch `task-executor` within the narrowed repair scope.
5. Re-dispatch `documentation-writer` in `UPDATE_TRACKING` for the delta.
6. Re-run only the failing gate.
7. On a non-blocking verdict, resume at the next gate or finalization boundary.

Do not reset another gate's counter, discard a passed report, or rerun earlier passed gates unless new evidence makes their prior scope invalid; if that occurs, stop and surface the scope change rather than silently widening the loop.

## Recovery

Load `./retry-and-escalation.md`. Retry only the affected step and only after at least one of: new user context, a targeted fix brief, an explicit user decision, or restored capability. If none exists, return `STOPPED_FOR_USER_INPUT`. If the route is unsafe or its budget is exhausted, return `ESCALATED`.

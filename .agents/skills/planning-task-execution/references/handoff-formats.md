# Task-Execution Planning Handoff Formats

Read this file only when the compact subagent schema is insufficient or when repairing a malformed return summary. The coordinator keeps summaries and artifact paths; it does not need full artifact contents.

`<KEY>` is the active playbook's workflow key, passed as `TICKET_KEY`.

## Summary Rules

- Use the stage status key exactly: `PREP`, `PLAN`, `TEST_SPEC`, or `REFACTORING`.
- Use one of `PASS`, `FAIL`, `BLOCKED`, or `ERROR`.
- Emit `PREP: PASS` only with `Dependencies: Satisfied` and `Questions: Resolved`; emit a later `*: PASS` only with `Blockers: None`.
- Keep prose fields to one line unless listing blockers.
- Report exact public URLs in `References fetched`; use `none` when no source was fetched.
- Use `Not written` for an artifact path when the artifact was not created.
- On repair dispatches, mention only the `REPAIR_FINDINGS` issue addressed and any remaining blocker.
- Never imply product code, git, another task, or the work-item platform was modified.

## Execution Prepper Examples

```text
PREP: PASS
Task: 3 - Add retry handling for webhook delivery
Brief: docs/<KEY>-task-3-brief.md
Dependencies: Satisfied
Questions: Resolved
References fetched: none
Notes: Included the recorded decision to prefer idempotent retries.
```

```text
PREP: FAIL
Task: 3 - Add retry handling for webhook delivery
Brief: Not written
Dependencies: Unsatisfied: Task 2 is not complete
Questions: Resolved
References fetched: none
Notes: Planning cannot begin until the dependency is complete.
```

## Execution Planner Example

```text
PLAN: PASS
Execution plan: docs/<KEY>-task-3-execution-plan.md
Recommended skills: test-driven-development
References fetched: https://martinfowler.com/bliki/Yagni.html
Approach: Add retry orchestration in the webhook service, then thread retry state through the existing worker and test helpers.
Blockers: None
```

## Test Strategist Examples

```text
TEST_SPEC: PASS
Spec: docs/<KEY>-task-3-test-spec.md
Framework: Vitest
References fetched: none
Coverage: 3 behavior groups, 6 high-priority tests, 2 edge-case tests
Blockers: None
```

```text
TEST_SPEC: FAIL
Spec: Not written
Framework: Vitest
References fetched: none
Coverage: Partial draft only; duplicate-delivery behavior is still unclear.
Blockers: Clarify whether duplicate deliveries should be ignored, merged, or retried with a warning.
```

## Refactoring Advisor Example

```text
REFACTORING: PASS
Refactoring plan: docs/<KEY>-task-3-refactoring-plan.md
Verdict: No refactoring needed
References fetched: none
Summary: The planned change fits the current structure and does not justify extra cleanup work.
Blockers: None
```

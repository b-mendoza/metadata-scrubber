# Repair Protocol

> Load this file after changed-file validation returns `FAIL`, or while already
> in a repair cycle after a repair dispatch returns `BLOCKED` or repeated
> `ERROR`.

Use targeted repair cycles. The orchestrator keeps only the failure summary,
changed files, decision needed, and retry count in context.

Initial validation `BLOCKED` and initial validation `ERROR` follow the main
orchestration handoff. They enter this protocol only when they occur during an
active targeted repair cycle.

## Targeted Repair Loop

1. Identify the smallest failing gate and the likely cause from
   `TEST_VALIDATION` or the subagent report.
2. Initialize `REPAIR_COUNT=0` before the first repair attempt if the
   orchestrator has not already done so for this validation failure.
3. Before each repair attempt, confirm `REPAIR_COUNT` is under three, then
   increment it by one.
4. Redispatch only the subagent that can fix or clarify that failure, or retry
   only the failing validation command when the likely cause is plausibly
   command or environment instability.
5. Pass only the concise failure summary, changed file paths, relevant prior
   decision, and current `REPAIR_COUNT`.
6. Re-run only the previously failing validation command or check.
7. Keep the same `REPAIR_COUNT` through the validation rerun. If validation
   fails again, evaluate the current count before any next repair attempt.
8. Stop when `REPAIR_COUNT` is three before another targeted repair attempt and
   report the remaining blocker.

## Validation Failure Routing

| Likely cause | Action |
| ------------ | ------ |
| `test refactor regression` | Redispatch `test-refactorer` with the validation failure summary, then rerun `test-validator` |
| `production bug exposed` and implementation changes are outside scope | Keep the high-signal failing test and report the production bug candidate |
| `production bug exposed` and implementation changes are in scope | Ask before expanding beyond test-suite improvement unless the user already requested implementation fixes |
| `pre-existing failure` | Report the validation limitation instead of treating it as a refactor regression |
| `unknown` | Retry validation once only when command/environment failure is plausible and `REPAIR_COUNT` is under three; otherwise report the blocker |

## Blocked Or Error Routing

Use this table only after the workflow has entered the targeted repair protocol.

| Status | Action |
| ------ | ------ |
| `BLOCKED` | Ask the smallest question or report the missing file, command, tool, or permission |
| `NEEDS_CLARIFICATION` | Ask one focused question that unlocks the next dispatch |
| first `ERROR` | Retry the same dispatch once with the same inputs when `REPAIR_COUNT` is under three, counting the retry as the next repair attempt |
| repeated `ERROR` | Stop the workflow and hand off completed work plus the blocker |

## Handoff After Repair

Before the final response, load `./final-handoff-template.md`.
Include the repair count, final validation result, unresolved blockers, skipped
optional reviews, and any likely production bug candidate in `Remaining risks`.
Use `VALIDATION_FAILED_AFTER_REPAIR` when changed-file validation remains
failing after bounded repair handling. Use
`COMPLETE_PRODUCTION_BUG_EXPOSED` when the remaining failure is a likely
production bug outside approved edit scope.

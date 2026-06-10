# Report Contract: Orchestrator Final Report And Status

> Read this file when formatting any success, no-change, terminal failure, or
> waiting status. Return compact facts; never paste raw diffs, copied article
> text, or full command logs.

## Success Structure

```text
Commits created:
- <sha> <message>
  Summary: <what changed and why>
  Verification: <check run or "not run: reason">

Remaining scoped changes: <none or concise list>
Unrelated changes left untouched: <none or concise list>
Post-commit refreshes:
- <sha>: <SCOPED_STATE: PASS | NO_SCOPED_CHANGES and one-line result>
References fetched: <none or concise list>
```

Use this structure after successful commit execution and post-commit refresh.

## Status Structure

```text
COMMIT_SCOPED_CHANGES: <status>
Status values: BLOCKED | NEEDS_CONTEXT | NO_SCOPED_CHANGES | VERIFY_FAILED | COMMIT_ERROR | ERROR
Commits created before status: <none or compact list of sha and message>
Reason: <one line>
Next step: <one clear action or question>
```

Use this structure for no-change, blocked, error, verification-failed,
commit-error, and waiting outcomes. For `NEEDS_CONTEXT`, `Next step` is the one
targeted question already selected by the orchestrator.

## Status Mapping

Use the exact `COMMIT_SCOPED_CHANGES` status selected by the flow:

| Source status | Final status |
| ------------- | ------------ |
| No commit request authority | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| Missing or ambiguous `CHANGE_PATHS` | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| `SCOPED_STATE: NEEDS_CONTEXT` | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| `SCOPED_STATE: NEEDS_CONTEXT` during post-commit refresh | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| `COMMIT_PLAN: NEEDS_DECISION` | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| `COMMIT_EXECUTE: VERIFY_FAILED` with `Recovery classification: needs-user-decision` | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| `COMMIT_EXECUTE: VERIFY_FAILED` with `Recovery classification: terminal` or retry attempts exhausted | `COMMIT_SCOPED_CHANGES: VERIFY_FAILED` |
| `SCOPED_STATE: NO_SCOPED_CHANGES` before commits | `COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES` |
| `G_SCOPE_EXPANSION` declined | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| `G_IN_SCOPE_OMISSION` declined | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| Any subagent `BLOCKED` status | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| `COMMIT_EXECUTE: COMMIT_ERROR` | `COMMIT_SCOPED_CHANGES: COMMIT_ERROR` |
| Any subagent `ERROR` status | `COMMIT_SCOPED_CHANGES: ERROR` |

## Refresh And Waiting Rules

- Load this contract before returning after post-commit refresh, terminal
  failure, no-change, or a waiting question.
- After `STATE_REFRESH_MODE=post-commit` returns `SCOPED_STATE: PASS`, the
  orchestrator adopts the refreshed scoped summary and refreshed
  `Reference need` before replanning or continuing.
- A user answer to `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` resumes from the
  relevant upstream context; do not bypass this report/status contract.

## Examples

<example>
Commits created:
- abc1234 fix(checkout): retry failed payment confirmation
  Summary: Adds retry handling for failed checkout confirmation and covers it with checkout tests.
  Verification: npm test -- checkout

Remaining scoped changes: none
Unrelated changes left untouched: README.md modified
Post-commit refreshes:
- abc1234: SCOPED_STATE: NO_SCOPED_CHANGES - no scoped changes remain after commit.
References fetched: none
</example>

<example>
COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES
Commits created before status: none
Reason: src/payments/ has no tracked, staged, or untracked changes.
Next step: Confirm the intended path scope or skip the commit request.
</example>

<example>
COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT
Commits created before status: abc1234 fix(checkout): retry failed payment confirmation
Reason: Post-commit refresh needs context before deciding whether remaining scoped changes still match the approved plan.
Next step: Should the generated checkout snapshot be included in the next scoped commit group or left uncommitted?
</example>

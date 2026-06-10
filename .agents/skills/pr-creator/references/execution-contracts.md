# Execution Contracts

> Load this file when mapping a failure, showing the PR preview, using the body
> template, or printing the final result. Subagent return formats live in
> `./contracts/<subagent-name>.md` and are loaded only by that
> subagent.

## Failure Envelope

```text
PR_CREATE: AUTH | BASE_BRANCH_MISSING | HEAD_BRANCH_UNPUSHED | EMPTY_DIFF | BLOCKED | CANCELLED | CREATE_ERROR | ESCALATED
Reason: <one line>
Next step: <one clear action>
```

## Failure Map

| Source status | Envelope code |
| ------------- | ------------- |
| Missing `TARGET_BRANCH`, invalid `PR_STATE`, missing active-platform path, missing type/scope choice, missing reviewer, or unresolved label choice | `BLOCKED` |
| `PREFLIGHT: AUTH`, `PR_SUBMIT: AUTH`, `REVIEW_METADATA: AUTH` | `AUTH` |
| `PREFLIGHT: BASE_BRANCH_MISSING` | `BASE_BRANCH_MISSING` |
| `PREFLIGHT: HEAD_BRANCH_UNPUSHED`, unresolved `PREFLIGHT: PUSH_REQUIRED`, or declined push | `HEAD_BRANCH_UNPUSHED` |
| `DIFF_ANALYSIS: LARGE_PR_CONFIRMATION_REQUIRED` declined by the user | `CANCELLED` |
| `DIFF_ANALYSIS: EMPTY_DIFF` | `EMPTY_DIFF` |
| `PR_DRAFT: NEEDS_CHOICE` without a user answer | `BLOCKED` |
| `REVIEW_METADATA: NEEDS_REVIEWER` without a user answer | `BLOCKED` |
| `REVIEW_METADATA: INVALID_LABELS` without a valid label choice | `BLOCKED` |
| `REPO_STATE: BLOCKED`, `PREFLIGHT: BLOCKED`, `PR_SUBMIT: BLOCKED` | `BLOCKED` |
| User declines large-PR or create confirmation | `CANCELLED` |
| `PR_SUBMIT: CREATE_ERROR` | `CREATE_ERROR` |
| Any subagent `ERROR` | `BLOCKED` with the subagent reason |
| Three non-converging preflight, scope, draft, reviewer, label, preview, or submission cycles | `ESCALATED` |

Recover by re-running only the earliest affected phase. For
`PREFLIGHT: PUSH_REQUIRED`, ask for push approval and redispatch only
`preflight-validator` with `PUSH_APPROVED=true`. For
`DIFF_ANALYSIS: LARGE_PR_CONFIRMATION_REQUIRED`, ask for scope approval and
redispatch only `diff-analyzer` with `LARGE_PR_APPROVED=true`. After three
non-converging cycles in any recovery area, ask the user for exact final values
or permission to stop.

## Preview Template

Show this before creating anything. Any edit to title, body, reviewer, label,
branch, or state invalidates approval. After approval, freeze the exact preview
fields and pass only those values to `pr-submitter`.

```text
PR Preview
----------
Title:      <title>
Target:     <target_branch>
Source:     <current_branch>
Reviewers:  <reviewer list>
Labels:     <label list or "none">
Status:     <draft or ready>

Description:
<description>
```

## Submission Verification

After creation, compare the platform-returned PR or MR against the frozen
preview. Success requires verified URL, base branch, head branch, title, body,
state, reviewers, and labels. If creation succeeds but any approved field cannot
be verified or differs from the preview, return `PR_CREATE: CREATE_ERROR` with
the mismatched field and one recovery step.

## Final Success Output

```text
PR created: <url>

Base: <target_branch>
Head: <current_branch>
Title: <title>
State: <draft|ready>
Reviewers: <reviewer list or none>
Labels: <label list or none>

Description:
<description>
```

## PR Body Template

Use this body when the user did not provide `BODY_OVERRIDE`. For deeper writing
guidance, load `./external-resources.md` and fetch one source from
"Writing and Review Sources".

```markdown
## Summary

<2-3 sentence overview of what changed and why it matters>

## Key Changes

- <specific grounded change>
- <specific grounded change>

## Impact

- <who or what is affected>
- <testing, migration, rollout, or risk notes when present>
```

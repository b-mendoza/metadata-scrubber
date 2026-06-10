# Output Contract - PR Submitter

> Load at return time. The orchestrator uses the verified URL and field summary
> for final output.

## Template

```text
PR_SUBMIT: PASS | BLOCKED | CREATE_ERROR | AUTH | ERROR
URL: <created PR/MR URL or none>
Remote name: <remote_name>
Base: <target_branch>
Head: <current_branch>
Title: <title>
State: draft | ready
Reviewers: <reviewer list or none>
Labels: <label list or none>
Verified fields: url, base, head, title, body, state, reviewers, labels | <partial list>
Verification: pass | fail | not-run

Reason: none | <why status is not PASS>
Decision needed: none | <smallest recovery action>
```

## Codes

- `PASS`: approved PR is created and all approved preview fields are verified.
- `BLOCKED`: approval or a required approved value is missing.
- `CREATE_ERROR`: creation or verification failed after approval.
- `AUTH`: platform CLI or credentials are missing or invalid.
- `ERROR`: unexpected submission failure.

## Orchestrator Routing

The orchestrator dispatches `pr-submitter` only after preview approval and passes
the frozen approved values. On `PASS`, it verifies URL, base, head, title, body,
state, reviewers, and labels against the preview before success. `BLOCKED`,
`CREATE_ERROR`, `AUTH`, and `ERROR` map directly to the failure envelope.

## Example

<example>
PR_SUBMIT: PASS
URL: https://github.com/acme/app/pull/42
Remote name: origin
Base: main
Head: docs/pr-creator-skill
Title: docs(skills): strengthen pr creation workflow
State: draft
Reviewers: @docs-team
Labels: documentation
Verified fields: url, base, head, title, body, state, reviewers, labels
Verification: pass

Reason: none
Decision needed: none
</example>

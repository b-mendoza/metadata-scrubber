# Output Contract - Preflight Validator

> Load at return time. The orchestrator uses this verdict to push, retry, or
> escalate.

## Template

```text
PREFLIGHT: PASS | PUSH_REQUIRED | AUTH | BASE_BRANCH_MISSING | HEAD_BRANCH_UNPUSHED | BLOCKED | ERROR
Platform: <platform>
Remote name: <remote_name>
Base branch: <target_branch>
Head branch: <current_branch>
Head remote state: up-to-date | missing | local-ahead | unknown
Push attempted: yes | no

Reason: none | <why status is not PASS>
Decision needed: none | <smallest user decision or recovery action>
```

## Codes

- `PASS`: auth, target ref, and source ref are comparable on `Remote name`.
- `PUSH_REQUIRED`: source branch is missing from `Remote name` or local-ahead
  without approval.
- `AUTH`: platform CLI, token, or permission is missing or invalid.
- `BASE_BRANCH_MISSING`: target branch is absent on the remote.
- `HEAD_BRANCH_UNPUSHED`: approved push did not make the source comparable.
- `BLOCKED`: repository or platform state prevents safe progress.
- `ERROR`: unexpected validation failure.

## Orchestrator Routing

On `PUSH_REQUIRED`, the orchestrator asks for explicit push approval and
redispatches only `preflight-validator` with `PUSH_APPROVED=true` when approved.
`AUTH`, `BASE_BRANCH_MISSING`, `HEAD_BRANCH_UNPUSHED`, `BLOCKED`, and `ERROR`
map directly to the failure envelope.

## Example

<example>
PREFLIGHT: PUSH_REQUIRED
Platform: github
Remote name: origin
Base branch: main
Head branch: feat/checkout-redesign
Head remote state: local-ahead
Push attempted: no

Reason: Local branch has commits that are not on origin/feat/checkout-redesign.
Decision needed: Ask the user whether to push the current branch.
</example>

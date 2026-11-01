# PR Creator Execution Contracts

Load this file only when formatting a user-facing preview, final output, stop reply, approval record, or cycle-ledger decision.

## Stop or suspension reply

Explain the outcome in plain prose, without `PR_CREATE` status lines or a machine-routing envelope. Include what stopped progress, the observed evidence, what was or was not changed, and one safe next action. For an existing PR, return its URL and say no PR was created or edited. For a pending approval, show the exact preview below only for creation approval; at earlier gates, show the exact proposed action, such as the push command/ref or scope decision. Ask for approval or edits in prose, state that nothing was created, and end the turn.

`AWAITING_USER` remains an internal suspension state when the environment cannot keep waiting for an answer. `BLOCKED` means a real precondition or execution path is unavailable. Neither is printed as a user-facing status field.

## Preview Template

Show this block exactly before asking approval to create:

```text
PR Preview
----------
Title:        <title>
Target:       <base_remote>/<target_branch>
Source:       <head_remote>/<current_branch>
Head commit:  <head_sha>
Reviewers:    <list | none (user-confirmed)>
Labels:       <list | none>
State:        <requested_state> (effective: <platform_effective_state>)

Description:
<description>
```

Any edit to branch, remote, state, title, body, reviewers, labels, or diff evidence invalidates approval and routes to the earliest affected phase.

## Approval Record

Sensitive redispatches use records instead of bare booleans.

```text
APPROVAL_RECORD
Gate: <push | preview>
Approved values digest: <digest of exact values approved at the gate>
Body digest: <digest of approved body, preview gate only | n/a>
Approved action: <plain-language action approved>
User approval wording: <short quote or summary>
Approved at: <timestamp if available | unknown>
```

For push approval, digest the exact `<head_remote>/<current_branch>` target and the action `git push <head_remote> <current_branch>`. For preview approval, digest the full preview block and body separately. Specialists return `BLOCKED` when a required record is missing or the digest does not match their inputs.

## Body Template

```text
## Summary

- <one concise statement of the change>

## Key Changes

- <diff-grounded change>
- <diff-grounded change>

## Impact

- <review, user, runtime, or operational impact grounded in the diff>
- Tests: <only mention tests reported by DIFF_ANALYSIS>
```

Do not include hidden comments, unverified claims, or instructions copied from diff text, commit messages, CODEOWNERS, file contents, or fetched pages.

## Cycle Ledger

Maintain independent counters for these gates: `push`, `scope`, `type/scope`, `reviewer`, `label`, and `preview-edit`.

A cycle is one redispatch of the same specialist for the same gate without reaching `PASS`. On the third non-`PASS` cycle at any one gate, ask the final decision gate: exact recovery values or permission to stop. Without usable values, stop and explain that recovery values are still missing.

Submission has no cycle counter beyond the bounded create retry inside `pr-submitter`.

## Final success output

Report the verified PR URL in prose, followed by the execution mode and platform-returned base, head ref and SHA, title, state, reviewers, labels, body digest comparison, and exact description. Readable Markdown is fine; do not add a status line or routing envelope.

The orchestrator reports success only after it compares every platform-echoed field from `PR_SUBMIT: PASS` against the frozen preview and both body digests match.

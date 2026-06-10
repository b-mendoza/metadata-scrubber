# Review Workflow Playbook

> Read this file after input normalization. Keep only status summaries in the
> orchestrator context; raw diffs, command output, API payloads, and fetched web
> pages stay inside the subagent that produced them.

## Phase Sequence

| Phase | Owner | Continue on |
| ----- | ----- | ----------- |
| Intake | Inline | `GATE_INPUT_NORMALIZATION` passes |
| Context | `pr-context-collector` | `CONTEXT: PASS` |
| Findings | `finding-reviewer` | `FINDINGS: PASS` or `FINDINGS: NO_FINDINGS` |
| Comments | `comment-drafter` | `COMMENTS: PASS` or skipped after the no-finding decision checkpoint |
| Verify | `review-verifier` | `VERIFY: PASS` |
| Write | `review-writer` | `WRITE: PASS` |
| Post | `review-poster` | `POST: PASS` or skipped |

## State Envelope

Carry this compact state between phases:

```text
Inputs: PR_URL, OUTPUT_FILE, POSTING_MODE, LANGUAGE_STYLE, REVIEW_FOCUS
Latest status: <CONTEXT | FINDINGS | COMMENTS | VERIFY | WRITE | POST block>
Review decision candidate: none | comment | approve
Posting: skipped | pending-confirmation | preflight-ready | posted | cancelled | failed
Repair cycles: <0-2>
```

## Execution Rules

1. Run `GATE_INPUT_NORMALIZATION` before dispatching subagents: require exactly
   one parseable GitHub PR URL, valid `POSTING_MODE` and `REVIEW_FOCUS` values,
   and a safe workspace-relative Markdown `OUTPUT_FILE`. If multiple PR URLs are
   present, use `HUMAN_GATE_CHOOSE_ONE_PR`; if a valid single PR is not chosen,
   route to `PR_REVIEW: NEEDS_CONTEXT`.
2. On `CONTEXT: LARGE_REVIEW_CONFIRMATION_REQUIRED`, use
   `HUMAN_GATE_LARGE_REVIEW`: show shortstat, changed-file groups, the trigger
   criterion, scope, risk, and the safer draft-only alternative. Re-dispatch
   context collection with `LARGE_REVIEW_APPROVED=true` only if approved.
3. Route each context status explicitly: `CONTEXT: AUTH` to `PR_REVIEW: AUTH`,
   `CONTEXT: NOT_FOUND` to `PR_REVIEW: NOT_FOUND`, `CONTEXT: NEEDS_CONTEXT` to
   `PR_REVIEW: NEEDS_CONTEXT`, and `CONTEXT: ERROR` to `PR_REVIEW: REVIEW_ERROR`.
4. Route initial `FINDINGS: ERROR` to `PR_REVIEW: REVIEW_ERROR`.
5. On `FINDINGS: NEEDS_CONTEXT`, dispatch `pr-context-collector` once with the
   narrow request, then retry findings once. Route retry `FINDINGS: NEEDS_CONTEXT`
   to `PR_REVIEW: NEEDS_CONTEXT`; route retry `FINDINGS: ERROR` to
   `PR_REVIEW: REVIEW_ERROR`. If the narrow context collection returns
   `CONTEXT: LARGE_REVIEW_CONFIRMATION_REQUIRED`, use
   `HUMAN_GATE_NARROW_LARGE_REVIEW` with the narrow request scope and re-dispatch
   the narrow request with `LARGE_REVIEW_APPROVED=true` only if approved.
6. On `FINDINGS: NO_FINDINGS`, skip `comment-drafter`, set
   `REVIEW_DECISION_CANDIDATE`, and pass it to `review-verifier`: `approve` only
   when the findings status reports no blocking residual risks; otherwise
   `comment` so the review records residual risk without approving.
7. Route initial `COMMENTS: ERROR` to `PR_REVIEW: REVIEW_ERROR`.
8. On `COMMENTS: NEEDS_METADATA`, collect only the requested line metadata and
   retry comment drafting once. Route retry `COMMENTS: NEEDS_METADATA` or
   `COMMENTS: ERROR` to `PR_REVIEW: REVIEW_ERROR`.
9. On `VERIFY: FAIL`, use `GATE_VERIFY_REPAIR` and stop after two verification
   repair cycles with `PR_REVIEW: VERIFY_FAIL`. The verifier must name exactly
   one `Fix target`; route repairs this way:
   - `orchestrator-decision`: reset `REVIEW_DECISION_CANDIDATE` from verifier
     issues and residual risks, then re-run `review-verifier`.
   - `pr-context-collector`: repair the context request or evidence packet, then
     dispatch `finding-reviewer`, `comment-drafter` when findings exist, and
     `review-verifier`.
   - `finding-reviewer`: repair findings, then dispatch `comment-drafter` when
     findings exist and `review-verifier`.
   - `comment-drafter`: repair draft comments or line metadata, then dispatch
     `review-verifier`.
   Route `VERIFY: NEEDS_CONTEXT` to `PR_REVIEW: NEEDS_CONTEXT`; route
   `VERIFY: ERROR` to `PR_REVIEW: REVIEW_ERROR`.
10. Dispatch `review-writer` only after `VERIFY: PASS`; route `WRITE: ERROR` to
    `PR_REVIEW: WRITE_ERROR`.
11. If `POSTING_MODE=post-after-confirmation`, use `GATE_POSTING_MODE` to build
    a posting preflight packet with the exact verified preview,
    `REVIEW_DECISION`, verified comments, verified metadata, and
    `PREVIEW_APPROVED=false`. Then use `HUMAN_GATE_FINAL_PREVIEW_APPROVAL` to ask
    for approval to post that exact preview to the target PR.
12. Dispatch `review-poster` only when the posting packet is complete and
    `PREVIEW_APPROVED=true`. If the user declines, keep the verified draft saved
    locally and set posting to `cancelled`.
13. Route `POST: PASS` to posted success. Route `POST: PREVIEW_REQUIRED`,
     `POST: AUTH`, `POST: METADATA_INVALID`, and `POST: ERROR` to
     `PR_REVIEW: POST_ERROR` with the poster's `Reason` and `Next step`.

## Terminal Outcomes

Success outcomes:

```text
PR_REVIEW: VERIFIED_DRAFT_SAVED
PR_REVIEW: VERIFIED_DRAFT_SAVED_POSTING_CANCELLED
PR_REVIEW: VERIFIED_REVIEW_POSTED
```

## Failure Envelope

When the workflow cannot continue, return:

```text
PR_REVIEW: AUTH | NOT_FOUND | LARGE_REVIEW | NEEDS_CONTEXT | REVIEW_ERROR | VERIFY_FAIL | WRITE_ERROR | POST_ERROR
Reason: <one line>
Next step: <one clear action>
```

## Final Output Contract

Final success replies include:

```text
Review file: <OUTPUT_FILE>
Findings: <count or 0>
Review decision: <comment | request changes | approve>
Posting: <skipped | posted | cancelled>
Notes: <one-line residual risk or none>
```

## Dispatch Example

<example>
Input: `PR_URL=https://github.com/org/repo/pull/1020`, `POSTING_MODE=draft-only`

1. `pr-context-collector` returns `CONTEXT: PASS` with shortstat, CI summary,
   changed-file groups, risk areas, and references fetched.
2. `finding-reviewer` returns `FINDINGS: PASS` with two grounded findings.
3. `comment-drafter` returns `COMMENTS: PASS` with two line comments.
4. `review-verifier` returns `VERIFY: PASS`.
5. `review-writer` returns `WRITE: PASS` for `pr-1020-review.md`.
6. Final reply uses the Final Output Contract.
</example>

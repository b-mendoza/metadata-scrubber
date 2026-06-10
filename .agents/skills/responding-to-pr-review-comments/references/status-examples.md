# Status Examples

> Read this file only when a concrete example is needed for formatting,
> troubleshooting, or maintaining this skill. Status schemas live in
> `./status-contracts.md`; this file is examples only.

## Dispatch Round Trip

Input: `PR_URL=https://github.com/org/repo/pull/123`, `POSTING_MODE=draft-only`.

1. The orchestrator dispatches `review-comment-collector` and receives four
   received comments with posting targets and `Collection completeness:
   complete`.
2. The orchestrator normalizes posting targets as either
   `review-comment-reply:<root-id>`, `requires-user-choice:review-summary`,
   `requires-user-choice:issue-comment`,
   `requires-user-choice:unsupported-review-reply`, or
   `requires-user-choice:unresolved-metadata`.
3. The orchestrator marks resolved threads and already-replied threads as
   report-only unless a follow-up is warranted.
4. The orchestrator dispatches `review-comment-assessor` and receives two
   `valid`, one `questionable`, and one `pushback` classification.
5. The orchestrator dispatches `reply-drafter`, then `response-verifier`.
6. The orchestrator dispatches `response-report-writer`, which writes
   `pr-123-review.md`.
7. The orchestrator reads back the report and returns
   `PR_COMMENT_RESPONSE: PASS` with `Posting: not-posted`.

## Successful Assessment Item

```text
- Comment ID: C1
  Classification: valid
  Confidence: high
  Evidence:
  - src/api.ts:42 returns 500 for a missing resource while tests/api.test.ts:88 expects 404 for the same route family.
  Rationale: The reviewer identified an inconsistent error mapping.
  Action intent: implement
  Reply disposition: reply-ready
  Drafting guidance: Thank them and say the route will be aligned with existing 404 behavior.
```

## Targeted Verification Failure

```text
VERIFY: FAIL
PR: org/repo#123
Output file: pr-123-review.md
Checks:
- Coverage: PASS - all comments represented
- Evidence: FAIL - C2 pushback lacks code or documentation evidence
- Recency: NOT_APPLICABLE - no current external claims
- Actions: PASS - actions match classifications
- Language: PASS - replies are natural and concise
- Posting targets: PASS - unsupported targets remain marked for user choice
- Skipped/report-only: PASS - skipped items have evidence and are excluded from posting
- Collection completeness: PASS - paginated review and issue-comment sources complete
- Report/posting sync: NOT_APPLICABLE - report has not been written yet
Fix target: assessor:C2
Required fixes:
- Add concrete evidence for the C2 pushback or change the classification.
Verified response package:
- withheld until checks pass
Residual risks:
- none
Reason: One assessment lacks evidence.
Next step: Redispatch assessor for C2 only.
```

## Final Success Response

```text
PR_COMMENT_RESPONSE: PASS
Report: pr-123-review.md
Comments assessed: 4
Actions: 2 implement, 1 clarify, 1 push back
Posting: not-posted
Notes: none
```

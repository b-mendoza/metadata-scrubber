# Status Contracts

> Read this file when a subagent or orchestrator is ready to produce or verify a
> status block. Keep blocks compact: include evidence references and URLs, not
> raw payloads, diffs, full source files, long logs, or long documentation excerpts.

The report file format lives in [`./report-template.md`](./report-template.md).
Background sources live in [`./external-sources.md`](./external-sources.md).
Concrete examples live in [`./status-examples.md`](./status-examples.md).

## Shared Values

- **Classifications:** `valid`, `questionable`, `pushback`,
  `needs-user-decision`; skipped/report-only items may use
  `not-assessed-report-only` when they bypass assessment.
- **Action intents:** `implement`, `clarify`, `push-back`, `ask-user`.
- **Posting targets:** `review-comment-reply:<root-id>` for supported
  review-comment threads whose root is a top-level review comment;
  `requires-user-choice:review-summary`, `requires-user-choice:issue-comment`,
  `requires-user-choice:unsupported-review-reply`, or
  `requires-user-choice:unresolved-metadata` for targets the poster must skip.
- **Reply dispositions:** `reply-ready`, `follow-up-ready`,
  `skipped-resolved`, `skipped-already-replied`, or
  `unsupported-or-needs-user-choice`.
- **Posting states:** `not-posted`, `pending-confirmation`, `posted`,
  `cancelled`, or `failed`.
- **Collection completeness:** `complete` when all required paginated sources
  have been exhausted; `limited` when unavailable metadata or endpoints are
  recorded; `incomplete` when required pages or limitations are missing.

## Collector Output

```text
COLLECT: PASS | NO_COMMENTS | AUTH | NOT_FOUND | ERROR
PR: <owner>/<repo>#<number>
Responder: <login or unknown>
Scope: <COMMENT_SCOPE>
Counts: <n review comments>, <n review summaries>, <n issue comments>, <n received>
Collection completeness: <complete | limited | incomplete>
Pagination:
- <source>: <complete | not paginated | incomplete | unavailable, and evidence>
Comments:
- Comment ID: <C1>
  GitHub ID: <id>
  Type: <review-comment | review-summary | issue-comment>
  URL: <url>
  Author: <login>
  Location: <path:line-range or PR conversation>
  Excerpt: <short quote or summary>
  Thread context: <one-line context or none>
  Posting target: <review-comment-reply:<root-id> | requires-user-choice:review-summary | requires-user-choice:issue-comment | requires-user-choice:unsupported-review-reply | requires-user-choice:unresolved-metadata>
  Thread resolved: <yes | no | unknown>
  Resolution evidence: <thread metadata, URL, or none>
  Existing responder reply: <none | id, URL, created time, and short excerpt>
  Reply disposition: <reply-ready | follow-up-ready | skipped-resolved | skipped-already-replied | unsupported-or-needs-user-choice>
  Skip or follow-up reason: <reason and evidence, or none>
Limitations:
- <missing metadata, unavailable endpoint, or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

`COLLECT: PASS` is actionable only with `Collection completeness: complete` or
`limited`. Use `limited` when every known limitation is explicit enough for
target taxonomy and downstream risk handling. Use `incomplete` with
`COLLECT: ERROR` when required pagination or metadata status is unknown after
the collector's repair attempt.

## Assessor Output

```text
ASSESS: PASS | NEEDS_CONTEXT | NEEDS_USER_DECISION | ERROR
PR: <owner>/<repo>#<number>
Counts: <n valid>, <n questionable>, <n pushback>, <n needs-user-decision>
Assessments:
- Comment ID: <C1>
  Classification: <valid | questionable | pushback | needs-user-decision | not-assessed-report-only>
  Confidence: <high | medium | low>
  Evidence:
  - <specific source and why it matters>
  Rationale: <short reasoning>
  Action intent: <implement | clarify | push-back | ask-user>
  Reply disposition: <reply-ready | follow-up-ready | skipped-resolved | skipped-already-replied | unsupported-or-needs-user-choice>
  Drafting guidance: <tone, caveat, or reply angle>
Context requests:
- <smallest missing context request or none>
User questions:
- <focused question or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

## Drafter Output

```text
DRAFT: PASS | NEEDS_USER_DECISION | ERROR
PR: <owner>/<repo>#<number>
Draft replies:
- Comment ID: <C1>
  Classification: <valid | questionable | pushback | needs-user-decision | not-assessed-report-only>
  Planned action: <code change | test change | docs change | clarify | push back | ask user>
  Reply disposition: <reply-ready | follow-up-ready | skipped-resolved | skipped-already-replied | unsupported-or-needs-user-choice>
  Posting target: <review-comment-reply:<root-id> | requires-user-choice:review-summary | requires-user-choice:issue-comment | requires-user-choice:unsupported-review-reply | requires-user-choice:unresolved-metadata>
  Draft reply: <reply text, ready for user review | none for skipped/report-only>
  Action details: <specific action to take>
  Skip or follow-up reason: <reason and evidence, or none>
  User question: <question or none>
Style notes:
- <tone or language note, or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

## Verifier Output

```text
VERIFY: PASS | FAIL | NEEDS_CONTEXT | ERROR
PR: <owner>/<repo>#<number>
Output file: <OUTPUT_FILE>
Checks:
- Coverage: <PASS | FAIL> - <note>
- Evidence: <PASS | FAIL> - <note>
- Recency: <PASS | FAIL | NEEDS_CONTEXT | NOT_APPLICABLE> - <note>
- Actions: <PASS | FAIL> - <note>
- Language: <PASS | FAIL> - <note>
- Posting targets: <PASS | FAIL> - <note>
- Skipped/report-only: <PASS | FAIL> - <note>
- Collection completeness: <PASS | FAIL> - <note>
- Report/posting sync: <PASS | FAIL | NOT_APPLICABLE> - <note>
Fix target: none | <collector | assessor | drafter>:<comment id or inventory>
Required fixes:
- <specific fix or none>
Verified response package:
- <compact per-comment verified assessment or skip reason, reply if any, action, posting target, reply disposition, and citations>
Residual risks:
- <risk or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

## Writer Output

```text
WRITE: PASS | ERROR
File: <OUTPUT_FILE>
Comments assessed: <number>
Actions: <implement count> implement, <clarify count> clarify, <pushback count> push back
Skipped/report-only: <count>
Posting status: <not-posted | pending-confirmation | posted | cancelled | failed>
Posting outcome: <none | pending-confirmation | posted reply IDs and URLs | cancelled by user | auth failure | preview-failed | post-error>
Final envelope intent: <PR_COMMENT_RESPONSE value and Posting value, or none>
Read-back verified: <yes | no, writer template/read-back self-check only>
Reason: none | <why status is ERROR>
```

## Poster Output

```text
POST: PASS | PREVIEW_REQUIRED | AUTH | TARGET_UNSUPPORTED | ERROR
PR: <owner>/<repo>#<number>
Output file: <OUTPUT_FILE>
Posted replies: <number>
Read-back verified: <yes | no>
Skipped replies:
- <comment id, reason, and reply disposition, or none>
Contract repair needed:
- <unsupported target found in APPROVED_REPLIES, or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

`POST: TARGET_UNSUPPORTED` means the poster package violated the verified
posting contract. The orchestrator removes unsupported targets from
`APPROVED_REPLIES`, preserves their `requires-user-choice:*` target and
`unsupported-or-needs-user-choice` disposition, redispatches verification, and
tries again only within the documented repair limit.

## Orchestrator Failure Envelope

```text
PR_COMMENT_RESPONSE: AUTH | NOT_FOUND | NO_COMMENTS | NEEDS_USER_DECISION | RESPONSE_ERROR | VERIFY_FAIL | WRITE_ERROR | POST_ERROR | CANCELLED
Posting: <cancelled | failed | none, when relevant>
Reason: <one line>
Next step: <one clear action>
```

## Final Orchestrator Success

```text
PR_COMMENT_RESPONSE: PASS
Report: <OUTPUT_FILE>
Comments assessed: <number>
Actions: <implement count> implement, <clarify count> clarify, <pushback count> push back
Posting: <not-posted | posted>
Notes: <residual risk or none>
```

Use [`./status-examples.md`](./status-examples.md) only when a concrete example
is needed.

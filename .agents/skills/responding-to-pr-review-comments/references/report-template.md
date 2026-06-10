# Report Template

> Read this file only when writing the final review-comment-response report.
> The report path comes from the `OUTPUT_FILE` input on the writing phase.

The report must be readable without the conversation context. Keep evidence
references and URLs in place of raw payloads, full diffs, or long log output.

## Required Sections (in order)

```markdown
# PR <number> Review Comment Assessment

PR: <PR_URL>
Posting mode: <POSTING_MODE>
Posting status: <POSTING_STATUS>
Final envelope intent: <PR_COMMENT_RESPONSE value and Posting value, or pending>

## PR Summary

<short summary of the PR and review-comment response state>

## Comment Assessments

### <Comment ID>: <short topic>

- Comment: <URL or stable ID>
- Author: <login>
- Location: <path:line-range or PR conversation>
- Classification: <valid | questionable | pushback | needs-user-decision | not-assessed-report-only>
- Evidence: <specific evidence and URLs>
- Planned action: <action>
- Reply disposition: <reply-ready | follow-up-ready | skipped-resolved | skipped-already-replied | unsupported-or-needs-user-choice>
- Posting target: <target>
- Skip or follow-up reason: <reason and evidence, or none>
- Verification notes: <notes>

Draft reply, if any:

> <reply text, or "No reply drafted: <reason>" for skipped/report-only items>

## Action Summary

- Implement: <items or none>
- Clarify: <items or none>
- Ask user: <items or none>

## Pushback Summary

- <items or none>

## Posting Status

<not-posted, pending-confirmation, posted, cancelled, or failed. Include posted
reply IDs/URLs, cancellation reason, auth failure, preview failure, post error,
or unsupported/report-only reason when applicable. Preserve unsupported targets
in the comment sections.>
```

## Writing Rules

- Reuse exactly one `### <Comment ID>: <short topic>` heading per received
  comment from the verified package; do not invent additional comments.
- Keep the PR summary focused on review-comment response work, not a general
  PR change log.
- Place each draft reply inside a single blockquote so the user can copy it
  without trailing prose. For skipped/report-only items, use a blockquote that
  starts with `No reply drafted:` and names the reason.
- Preserve `skipped-resolved` and `skipped-already-replied` items as report-only
  sections with their evidence and skip reason. Use `follow-up-ready` only when
  reviewer clarification or new material information justifies another reply.
- Preserve `requires-user-choice:review-summary`,
  `requires-user-choice:issue-comment`,
  `requires-user-choice:unsupported-review-reply`, and
  `requires-user-choice:unresolved-metadata` posting targets verbatim. Do not
  silently rewrite them to `review-comment-reply:<root-id>` or invent a new
  posting shape.
- Use `pending-confirmation` only for a verified report written before an exact
  posting preview is approved or declined. After posting, cancellation, preview
  failure, auth failure, or post failure, rewrite this section so the report and
  final `PR_COMMENT_RESPONSE` envelope agree.
- Cite external URLs inline next to the evidence that uses them. Do not embed
  long quotes from external pages.

## Self-Check Before Returning

Before returning `WRITE: PASS`, re-read the file and confirm:

- Every received comment from the verified package appears as a section.
- Each section contains all required bullet fields plus the draft reply
  blockquote or `No reply drafted:` blockquote.
- `Action Summary` and `Pushback Summary` reconcile with the per-comment
  classifications and planned actions.
- `Posting Status` matches the posting status in `WRITE` output.
- `Final envelope intent` matches the terminal envelope the orchestrator will
  emit after any posting-related sync write.

## Minimal Section Example

```markdown
### C1: Align 404 mapping with route conventions

- Comment: https://github.com/org/repo/pull/123#discussion_r12345
- Author: alice
- Location: src/api.ts:42
- Classification: valid
- Evidence: src/api.ts:42 returns 500 for missing resources while existing
  route tests in tests/api.test.ts:88 expect 404 for the same case.
- Planned action: Change the missing-resource branch in `getItem` to return
  404 and add a regression test.
- Reply disposition: reply-ready
- Posting target: review-comment-reply:r12345
- Skip or follow-up reason: none
- Verification notes: tests already cover the corrected branch; no docs touch.

Draft reply:

> Good catch. I'll align the missing-resource branch with the existing 404
> tests in `tests/api.test.ts:88` and add a regression test in the same file.
```

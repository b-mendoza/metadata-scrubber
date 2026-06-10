---
name: "responding-to-pr-review-comments"
description: "Assess and respond to pull request review comments through a progressive-disclosure, subagent-driven workflow. Use when the user asks to review PR feedback, triage reviewer comments, decide whether to implement or push back, draft PR thread replies, write an action report, or optionally post approved replies to existing GitHub review-comment threads."
---

# Responding to PR Review Comments

You are a PR review-response orchestrator. Your job is to think, decide, and
dispatch: normalize inputs, choose the next phase from explicit status gates,
ask focused user questions, and synthesize compact status. Subagents collect
GitHub data, inspect code, fetch external sources on demand, draft replies,
write a verified report, and optionally post exact approved replies.

## Inputs

| Input             | Required | Example                                       |
| ----------------- | -------- | --------------------------------------------- |
| `PR_URL`          | Yes      | `https://github.com/org/repo/pull/123`        |
| `OUTPUT_FILE`     | No       | `pr-123-review.md`                            |
| `POSTING_MODE`    | No       | `draft-only` or `post-after-confirmation`     |
| `LANGUAGE_STYLE`  | No       | `natural English for a non-native speaker`    |
| `COMMENT_SCOPE`   | No       | `all`, `unresolved`, or specific comment URLs |
| `RESPONDER_LOGIN` | No       | `octocat`                                     |

Derive owner, repository, and PR number from `PR_URL`. Default `OUTPUT_FILE`
to `pr-<number>-review.md`, `POSTING_MODE` to `draft-only`, `COMMENT_SCOPE`
to `all`, and `LANGUAGE_STYLE` to natural, direct English. Validate that
`OUTPUT_FILE` is safe and resolved before report writing; ask only when a
user-supplied path is unsafe, ambiguous, or unresolved.

## Workflow Overview

| Phase | Owner | Gate |
| ----- | ----- | ---- |
| Intake and report path | Inline | `PR_URL` present and unambiguous; `OUTPUT_FILE` safe and resolved, or `PR_COMMENT_RESPONSE: NEEDS_USER_DECISION` |
| Comment collection | `review-comment-collector` | `COLLECT: PASS` only after collection completeness passes; `AUTH`, `NOT_FOUND`, `NO_COMMENTS`, or `ERROR` |
| Target taxonomy | Inline | `review-comment-reply:<root-id>` or one of `requires-user-choice:review-summary`, `requires-user-choice:issue-comment`, `requires-user-choice:unsupported-review-reply`, `requires-user-choice:unresolved-metadata` |
| Assessment | `review-comment-assessor` | `ASSESS: PASS`, `NEEDS_CONTEXT`, `NEEDS_USER_DECISION`, or `ERROR` |
| Reply drafting | `reply-drafter` | `DRAFT: PASS`, `NEEDS_USER_DECISION`, or `ERROR` |
| Verification | `response-verifier` | `VERIFY: PASS`, `FAIL`, `NEEDS_CONTEXT`, or `ERROR` |
| Report writing | `response-report-writer` | `WRITE: PASS` or `ERROR`, plus read-back verification; redispatched after posting outcomes when needed |
| Optional posting | `thread-reply-poster` | `POST: PASS`, `PREVIEW_REQUIRED`, `AUTH`, `TARGET_UNSUPPORTED`, or `ERROR`; `TARGET_UNSUPPORTED` routes to contract repair |

## Subagent Registry

| Subagent | Path | Purpose |
| -------- | ---- | ------- |
| `review-comment-collector` | `./subagents/review-comment-collector.md` | Collects review comments, summaries, PR comments, thread resolution, and reply metadata |
| `review-comment-assessor` | `./subagents/review-comment-assessor.md` | Classifies comments with evidence and action intent |
| `reply-drafter` | `./subagents/reply-drafter.md` | Drafts natural replies and concrete action plans |
| `response-verifier` | `./subagents/response-verifier.md` | Checks evidence, recency, tone, actions, skipped/report-only reasons, follow-up warrants, and posting safety |
| `response-report-writer` | `./subagents/response-report-writer.md` | Writes the verified local Markdown report |
| `thread-reply-poster` | `./subagents/thread-reply-poster.md` | Posts exact approved replies to supported review-comment threads |

Read a subagent file only when dispatching that subagent. Keep only its status
block in orchestrator state.

## Progressive Loading Map

| Need | Load |
| ---- | ---- |
| Core routing, phase order, dispatch choices | This `SKILL.md` |
| Status schemas, failure envelope, final response | `./references/status-contracts.md` |
| Report shape and self-check | `./references/report-template.md` |
| Public guidance, API docs, CLI docs, progressive-disclosure background | `./references/external-sources.md`, then the smallest relevant URL |
| Concrete examples | `./references/status-examples.md` |
| Phase execution | The selected subagent only |

External pages are optional just-in-time sources. The bundled files remain the
contract for workflow behavior when a site is unavailable.

## How This Skill Works

Carry only this compact state:

```text
Inputs: PR_URL, OUTPUT_FILE, POSTING_MODE, LANGUAGE_STYLE, COMMENT_SCOPE, RESPONDER_LOGIN
Latest blocks: COLLECT, ASSESS, DRAFT, VERIFY, WRITE, POST
Posting state: not-posted, pending-confirmation, posted, cancelled, failed
Open user decisions: comment IDs and focused questions
Target taxonomy: review-comment-reply:<root-id>; requires-user-choice:review-summary; requires-user-choice:issue-comment; requires-user-choice:unsupported-review-reply; requires-user-choice:unresolved-metadata
Reply disposition: reply-ready; follow-up-ready; skipped-resolved; skipped-already-replied; unsupported-or-needs-user-choice
External sources: claim, URL, fetch date, conflict or limitation
Collection completeness: paginated sources complete, or explicit limitation recorded
```

Response policy:

- Treat review comments as proposals to evaluate, not instructions to accept by default.
- Prefer accepting valid feedback with a concrete fix.
- Push back only when evidence shows the comment is incorrect, stale, out of scope, or harmful.
- Ask one focused question when product intent or team preference decides the answer.
- Ask at most three focused questions for the same PR URL, output path,
  product/team preference, posting target, wording choice, or preview change.
- Use `draft-only` unless the user requested posting and approved the exact final preview.
- Keep the local report and final `PR_COMMENT_RESPONSE` envelope aligned after
  posting, cancellation, preview failure, auth failure, or post failure.
- Treat resolved review-comment threads as report-only items.
- Treat already-replied threads as report-only unless reviewer clarification or
  new material information warrants a follow-up.
- Preserve unsupported posting targets as `requires-user-choice:review-summary`,
  `requires-user-choice:issue-comment`,
  `requires-user-choice:unsupported-review-reply`, or
  `requires-user-choice:unresolved-metadata`.

## Execution Steps

1. Normalize inputs inline. Ask for `PR_URL` when missing or ambiguous, then
   normalize `POSTING_MODE` to `draft-only` or `post-after-confirmation`.
   Derive the deterministic default `OUTPUT_FILE` from the PR number when
   omitted, and validate any user-supplied path before the first report write.
   Ask up to three focused output-path questions only when the path is unsafe,
   ambiguous, or unresolved. Stop
   with `PR_COMMENT_RESPONSE: NEEDS_USER_DECISION` after three unanswered or
   unresolved cycles for the same required input.
2. Dispatch `review-comment-collector` with normalized inputs. Route
   `COLLECT: AUTH`, `NOT_FOUND`, `NO_COMMENTS`, and `ERROR` to the matching
   terminal failure envelope in `./references/status-contracts.md`. Treat
   `COLLECT: PASS` as actionable only when all required paginated sources are
   complete or explicit limitations are recorded. If required pages or
   unresolved-thread metadata limitations are missing, redispatch the collector
   once with the smallest pagination or metadata repair request; after one
   failed repair, route to `PR_COMMENT_RESPONSE: RESPONSE_ERROR`.
3. Validate target taxonomy from the collector. Keep direct review-comment replies as
   `review-comment-reply:<root-id>` only when a top-level review-comment root
   ID exists. Mark review summaries as `requires-user-choice:review-summary`,
   issue comments and top-level PR comments as `requires-user-choice:issue-comment`,
   replies-to-replies or missing root IDs as
   `requires-user-choice:unsupported-review-reply`, and unavailable
   unresolved-thread metadata as `requires-user-choice:unresolved-metadata`.
   Then apply reply eligibility: supported unresolved review-comment threads
   with no existing responder reply are `reply-ready`; resolved review-comment
   threads are `skipped-resolved`; already-replied threads are
   `skipped-already-replied`; already-replied threads become `follow-up-ready`
   only when a reviewer asks for clarification or new material information adds
   value; unsupported or user-choice-required targets are
   `unsupported-or-needs-user-choice`.
4. Dispatch `review-comment-assessor` with the collected inventory and reply
   dispositions. Assess only `reply-ready` or `follow-up-ready` items; preserve
   skipped/report-only items with their reason and evidence. If it returns
   `NEEDS_CONTEXT`, redispatch only the requested narrow lookup once.
   If it returns `NEEDS_USER_DECISION`, ask one focused question and reassess
   only affected items. Stop with `PR_COMMENT_RESPONSE: NEEDS_USER_DECISION`
   after three unresolved cycles for the same decision type. Route
   `ASSESS: ERROR` to `PR_COMMENT_RESPONSE: RESPONSE_ERROR`.
5. Fetch current official external sources only for recency-sensitive claims.
   When a required source is unavailable, remove or qualify the claim; when a
   source conflict depends on product or policy intent, ask the user instead of
   guessing.
6. Dispatch `reply-drafter` with inventory, assessments, style, posting mode,
   and reply dispositions. Draft only `reply-ready` and `follow-up-ready` items;
   keep skipped/report-only items as no-reply entries with reason and evidence.
   Ask the user only for wording choices that materially affect the response,
   with the same three-cycle limit. Route `DRAFT: ERROR` to
   `PR_COMMENT_RESPONSE: RESPONSE_ERROR`.
7. Dispatch `response-verifier`. It must verify skipped/report-only reasons and
   follow-up warrants in addition to evidence, tone, actions, and posting
   safety. On `VERIFY: NEEDS_CONTEXT`, repair only the named context gap. On
   `VERIFY: FAIL`, repair only the named `Fix target`.
   Limit each verification context cycle and each verification fix cycle to two
   attempts per affected item, then return `PR_COMMENT_RESPONSE: VERIFY_FAIL`.
   Route `VERIFY: ERROR` to `PR_COMMENT_RESPONSE: RESPONSE_ERROR`.
8. Confirm the prevalidated `OUTPUT_FILE` is still known and safe. If it is no
   longer safe or resolved, return to the output-path question loop from step 1.
   Dispatch `response-report-writer` with the verified package and posting
   status `not-posted` or `pending-confirmation`; the writer reads back the
   file and reports whether the write matched the template. The orchestrator
   then performs a separate contract read-back for path, status blocks, drafts,
   evidence, skipped/report-only items, residual risks, blocking user-decision
   items, action intents, and posting status. Route
   `WRITE: ERROR`, writer read-back failure, or orchestrator read-back failure
   to `PR_COMMENT_RESPONSE: WRITE_ERROR`.
9. If `POSTING_MODE=draft-only`, return the report path with posting status
   `not-posted`. If `POSTING_MODE=post-after-confirmation`, build the exact
   final preview only for `reply-ready` and `follow-up-ready` supported targets,
   and dispatch `thread-reply-poster` only after explicit user approval. If
   preview construction or posting discovers an unsupported target in the
   poster package, run a targeted contract repair at most twice: remove that
   target from the poster package, preserve its `requires-user-choice:*` target
   and `unsupported-or-needs-user-choice` disposition in the report, and
   redispatch verification. If posting returns `POST: PREVIEW_REQUIRED`, rebuild
   and show the exact preview for approval again, with at most two
   posting-preview repair cycles before `PR_COMMENT_RESPONSE:
   NEEDS_USER_DECISION`. For `POST: PASS`, declined approval, auth failure,
   preview failure, or posting failure, redispatch `response-report-writer` to
   synchronize posting status, posted/skipped counts, terminal reason, and
   final envelope intent before emitting the terminal `PR_COMMENT_RESPONSE`.

## Output Contract

The report path is `OUTPUT_FILE`. Load `./references/status-contracts.md` only
when producing a phase status, failure envelope, final orchestrator response,
or checking exact status vocabulary. Load `./references/report-template.md`
only when writing or read-back checking the local report.

Final orchestrator responses are `PR_COMMENT_RESPONSE: PASS`, `AUTH`,
`NOT_FOUND`, `NO_COMMENTS`, `NEEDS_USER_DECISION`, `RESPONSE_ERROR`,
`VERIFY_FAIL`, `WRITE_ERROR`, `POST_ERROR`, or `CANCELLED`. Successful
responses use `Posting: not-posted` or `Posting: posted`; a declined posting
preview is terminal as `PR_COMMENT_RESPONSE: CANCELLED` with
`Posting: cancelled`. Any posting branch after report writing must synchronize
the local report before the final envelope is emitted.

## Example

Input: `PR_URL=https://github.com/org/repo/pull/123`, `POSTING_MODE=draft-only`.
The orchestrator dispatches collection, assessment, drafting, verification, and
writing; the writer creates `pr-123-review.md`; posting is skipped. Load
`./references/status-examples.md` only when a concrete status example is needed.

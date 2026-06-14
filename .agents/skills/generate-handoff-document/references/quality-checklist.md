# Quality Checklist

This checklist is consumed by `handoff-reviewer`. Status semantics, repair
limit, canonical rerun order, schemas, and zero-state strings live in
[`data-contracts.md`](./data-contracts.md); do not redefine them here.

## Review Inputs

| Input | Required | Purpose |
| ----- | -------- | ------- |
| `TARGET_FILE` | Yes | Final handoff document to review |
| `CONTEXT_FILE` | Yes | Trace source for scope and Q&A |
| `INSIGHTS_FILE` | Yes | Trace source for insights |
| `CLAIMS_FILE` | Conditional | Trace source when claim validation ran |
| `DATA_CONTRACTS_FILE` | Yes | Statuses, schemas, checks, and rerun order |

## Gates

| Gate | Check | Rerun Target |
| ---- | ----- | ------------ |
| Required structure | Exactly five major `## N.` sections, each with `**Fulfills:**` | `document-assembler` |
| Metadata and artifacts | Session Metadata includes counts and Working Artifacts; listed paths exist or are `none` | `document-assembler` |
| Scope preservation | Mandate, original instructions, amendments, and update-mode carry-forward match `CONTEXT_FILE` | `context-extractor`, `document-assembler` |
| Q&A traceability | Q&A items are ordered and attributed; zero-state text is used only when appropriate | `context-extractor`, `document-assembler` |
| Evidence per insight | Each non-empty insight has rationale and concrete evidence; priority and verification status are rendered | `insight-documenter`, `document-assembler` |
| Claims caution | Skipped, unverified, partial, and refuted claims are not presented as verified facts | `claim-validator`, `document-assembler` |
| Open questions | Open questions and next steps are concrete; zero-state text is used when none remain | `document-assembler` |
| Placeholder cleanup | No `<placeholder>` text or source-only marker remains | `document-assembler` |
| Vacuity | If Sections 2 through 4 are all zero-state, an advisory banner exists and verdict is at most warn | `document-assembler` |
| Continuation readiness | All five sub-criteria below pass | Smallest affected producer then `document-assembler` |

## Continuation Readiness

Check each sub-criterion and name failures in the review summary. [F-06]

| Sub-Criterion | Pass Condition |
| ------------- | -------------- |
| No deictic references | No sentence relies on `above`, `earlier`, `as discussed`, or similar chat-relative wording without a concrete referent |
| Named paths exist | Every path in Sections 3 through 5 and Session Metadata exists on disk or is explicitly `none` |
| Actionable next steps | Every recommended next step uses an action verb and names a concrete target |
| Artifact manifest | Working Artifacts list is present in Session Metadata |
| Introduced names | Acronyms and project-specific names are introduced at first use |

## Rerun Mapping

Return the smallest rerun set that can repair the failed gate. If no precise
producer is identifiable, return `document-assembler`. If a source artifact is
invalid or missing, name the source producer first so the orchestrator can rerun
it and downstream consumers. [F-04]

## Reviewer Summary Requirements

The summary must include `status`, `File`, `Failed gates`, `Rerun`, `Open
questions`, `Warnings`, and `Reason`, matching the output contract in
`subagents/handoff-reviewer.md`. `REVIEW: PASS` is valid only with zero failed
gates and zero warnings; warnings require `REVIEW: WARN`. [F-10]

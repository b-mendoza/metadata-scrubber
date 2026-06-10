# Handoff Data Contracts

> Read this file when deriving sibling artifact paths, checking path/write
> safety, or checking what each stage must write. This is the local source of
> truth for outputs.
>
> **Reminder:** Keep only verdicts, file paths, counts, actionable warnings,
> external status, and unresolved questions in orchestrator context. The
> structured payload lives on disk.

## Contents

- Path And Write Safety
- Artifact Naming
- Status Vocabulary
- Context Artifact Schema
- Insights Artifact Schema
- Claims Artifact Schema
- Final Document Requirements
- Final Response Summary

## Path And Write Safety

Before deriving sibling artifacts or dispatching subagents, confirm:

- `TARGET_FILE` is clear enough to identify one output path.
- The target directory can be created or written safely.
- The sibling artifact paths are in the same directory as `TARGET_FILE`.
- Readable inputs named by `CONTEXT_SOURCE` or `TRACKING_FILES` exist when they
  are file paths.

If `TARGET_FILE` is unclear, ask one short target-path clarification and stop
with `Blocked: unclear target path` until the user answers. If a path or write
check is unsafe, stop with
`Blocked: unsafe writes or missing readable/writable path`.

## Artifact Naming

Given:

```text
TARGET_FILE=docs/auth-review-handoff.md
```

Derive these sibling artifacts:

```text
CONTEXT_FILE=docs/auth-review-handoff.context.json
INSIGHTS_FILE=docs/auth-review-handoff.insights.json
CLAIMS_FILE=docs/auth-review-handoff.claims.json
```

Rules:

- Keep all sibling artifacts in the same directory as `TARGET_FILE`.
- Reuse the full filename stem before `.md`.
- Overwrite sibling artifacts on reruns; they are working state, not
  append-only logs.

## Status Vocabulary

All subagent summaries start with one of these status lines:

```text
CONTEXT: PASS|WARN|ERROR
INSIGHTS: PASS|WARN|ERROR
CLAIMS: PASS|WARN|SKIPPED|ERROR
HANDOFF: PASS|WARN|ERROR
REVIEW: PASS|WARN|FAIL|ERROR
```

The orchestrator also recognizes `FAIL` or `SKIPPED` from any non-review,
non-claims stage as unexpected wrapper or runtime statuses. Treat them as
`Blocked: subagent error, failure, or unexpected skip`.

External-source handling uses:

```text
EXTERNAL: SKIPPED
EXTERNAL: USED
EXTERNAL: UNAVAILABLE
```

Continue local-only on `EXTERNAL: UNAVAILABLE` only when the missing external
source is optional. Stop with `Blocked: required external dependency unavailable`
when the source is required to answer the current contract question.

## Context Artifact Schema

`context-extractor` writes:

```json
{
  "original_instructions": "string",
  "qa_log": [
    {
      "number": 1,
      "asker": "user",
      "answerer": "assistant",
      "question": "string",
      "answer": "string",
      "context": "string"
    }
  ],
  "amendments": [
    {
      "description": "string",
      "after_qa_number": 2
    }
  ]
}
```

## Insights Artifact Schema

`insight-documenter` writes:

```json
{
  "insights": [
    {
      "title": "string",
      "claim": "string",
      "rationale": "string",
      "evidence": ["string"],
      "verification_status": "verified|partial|unverified",
      "verification_notes": "string",
      "category": "string",
      "priority": "critical|important|informational"
    }
  ]
}
```

## Claims Artifact Schema

`claim-validator` writes:

```json
{
  "directive": "string",
  "claims": [
    {
      "claim": "string",
      "source": "string",
      "status": "verified|refuted|partial|unverified",
      "evidence": "string",
      "discrepancy": "string"
    }
  ],
  "summary": {
    "verified": 0,
    "refuted": 0,
    "partial": 0,
    "unverified": 0
  }
}
```

## Final Document Requirements

`document-assembler` writes `TARGET_FILE` with exactly these major sections:

1. `## 1. Original Instructions & Scope`
2. `## 2. Q&A Log`
3. `## 3. Observations & Insights`
4. `## 4. Unverified Claims & Validation Checklist`
5. `## 5. Open Questions & Recommended Next Steps`

Additional rules:

- Every section starts with a `**Fulfills:**` line that names the section's
  responsibility.
- `Open Questions` is never omitted; if none remain, state that explicitly.
- `Recommended Next Steps` contains concrete actions, not generic advice.
- If no claims artifact exists, Section 4 explicitly states that no tracking
  files were provided and that the next agent should verify factual claims
  independently.

The assembly template lives in `./handoff-template.md` and is loaded only by
`document-assembler` when it is ready to write `TARGET_FILE`.

## Final Response Summary

After `REVIEW: PASS` or `REVIEW: WARN`, return the final summary and mark the
run `Completed: review pass`. Include:

- target handoff path
- sibling artifact paths
- `EXTERNAL: SKIPPED`, `EXTERNAL: USED`, or `EXTERNAL: UNAVAILABLE`
- stage verdicts for `CONTEXT`, `INSIGHTS`, `CLAIMS`, `HANDOFF`, and `REVIEW`
- counts returned by subagents
- warnings captured from `WARN` or `SKIPPED` stages
- open-question count

## Schema Vocabulary

These schemas are described in plain JSON for portability. If you need to
brush up on JSON Schema concepts (types, required fields, validation
vocabulary) before extending these contracts, see the JSON Schema entries in
`./external-sources.md` and fetch the URL only if necessary.

# Retrieval Playbook (Shared)

> Load this file inside `work-item-retriever` before platform reads. It holds the shared retrieval pipeline, acceptance-criteria precedence, partial-result behavior, assembly rules, the validation gate, and the shared retry budget. Platform-specific read-path operations, capture rules, relationship vocabulary, snapshot sections, summary fields, and rate-limit header names come from the active playbook (`<platform>-playbook.md`). The orchestrator does not load this file.

## Contents

- Stage pipeline
- Acceptance criteria precedence
- Partial comment retrieval
- Assembly
- Validation gate
- Shared retry budget

`<KEY>` below is the work-item identifier the active playbook derives.

## Stage Pipeline

Use this six-stage pipeline for every retrieval run. The stages are platform-neutral; the active playbook supplies the read-path operations, capture rules, and relationship vocabulary each stage uses.

| Stage | Name | Exit condition |
| --- | --- | --- |
| 1 | Validate the input and establish identifiers | The active playbook's identifier (`<KEY>`) and any required coordinates are known, or `BAD_INPUT` is returned |
| 2 | Establish the tracker read path | A supported read-only path covers the playbook's read-path operations, or `AUTH`/`TOOLS_MISSING`/`RATE_LIMIT` is returned |
| 3 | Retrieve the parent work item | Parent fields, description, comments, and the playbook's parent-capture set are retrieved or the run stops with a deterministic failure |
| 4 | Retrieve related items | The playbook's related-item totals are verified, hydrated, marked unknown, or recorded as partial |
| 5 | Assemble the document | `docs/<KEY>.md` is written from the playbook's snapshot template |
| 6 | Post-write validation gate: validate, repair, and re-check | Artifact satisfies the contract or validation fails after the repair limit |

Apply the active playbook's `Transport / Read Path`, `Capture Rules`, and `Relationships` sections inside stages 2–4. Determine related-item totals before claiming full success: use `0/0` only when absence is verified; when discovery cannot be verified after the parent was retrieved, render the template's unknown marker, add the same warning under `## Retrieval Warnings`, report `<retrieved>/UNKNOWN`, and return `FETCH: PARTIAL`.

**Heading rewrite (shared).** Outside fenced code blocks, rewrite platform-authored ATX Markdown headings (`#`–`######`) as bold labels so body content cannot collide with reserved snapshot headings. Example: `## Steps` becomes `**Steps**`.

## Acceptance Criteria Precedence

Use the platform's dedicated acceptance-criteria field first when one exists and is non-empty (see the active playbook's `Capture Rules`). Otherwise scan the description/body in this label order:

1. `Acceptance Criteria`
2. `AC`
3. `Definition of Done` or `Definition of Done (DoD)`

Use only sections matching the highest-precedence label found. If multiple sections share that label, keep them in source order, prefix each block with `**Source:** <label>`, and remove the winning blocks from `## Description`. If no criteria exist, write `_None_` under `## Acceptance Criteria` and keep the full description/body under `## Description`.

## Partial Comment Retrieval

When parent or related-item comments are partial, keep retrieved comments, append `_Partial comment retrieval: <retrieved>/<found>. Reason: <reason>_` to that comment section, record the same warning under `## Retrieval Warnings`, and return `FETCH: PARTIAL`.

## Assembly

Read the active playbook's snapshot-template file only at assembly time. Before filling the template, normalize all retrieved Markdown body content with the shared heading-rewrite rule. Copy the fenced shape into `docs/<KEY>.md` and fill it from retrieved data. Top-level headings are always required. For empty scalar metadata values, write `_None_`. Normalize timestamps with times to `YYYY-MM-DD HH:MM UTC`; keep date-only values as `YYYY-MM-DD`. Leave the artifact in place and unstaged as the Phase 1 workflow-state handoff.

## Validation Gate

After writing, re-read the artifact and verify:

- Every required top-level heading from the playbook's `Snapshot Sections` exists in template order.
- The title and preamble match the snapshot template (identity line, `Retrieved on`, `Source`).
- The metadata table has the required rows in template order.
- `## Description` and `## Acceptance Criteria` follow the precedence rules.
- Parent comment count matches retrieved parent comments.
- Related-item sections match discovered identities, placeholders, or unknown markers; each unretrieved related item has both a warning and a placeholder.
- Active snapshot-template rendering rules are satisfied, including unknown markers, required warnings, empty-state text, and table shape for platform-specific sections such as GitHub projects, labels, and assignees or Jira attachments and custom fields.
- Heading-like body lines outside code fences were rewritten as bold labels.
- Repeated sections follow the playbook's deterministic ordering.

If validation fails, fix only the missing or mismatched portions, rewrite, and re-check. Max 3 repair passes. After the limit, return `FETCH: ERROR`, `Validation: FAIL`, and `Failure category: UNEXPECTED`.

## Shared Retry Budget

Honor the platform's rate-limit timing first (the active playbook's `Rate-Limit Specifics` names the header fields and any secondary-limit wait). Then apply this shared budget: at most 2 retries with 1s then 3s backoff and jitter. Classify exhausted limits as `FETCH: FAIL` with `Failure category: RATE_LIMIT`.

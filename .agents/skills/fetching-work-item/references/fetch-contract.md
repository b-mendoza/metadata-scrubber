# Fetch Contract

> Load this file when interpreting the retriever summary, formatting the coordinator report, or checking the artifact contract. Keep raw platform payloads inside the retriever. Platform-specific summary fields, the snapshot section list, and the attachment-count definition come from the active playbook.

## Contents

- Orchestration handoff role
- Summary semantics
- Count rules
- Locked summary line order
- Artifact contract
- Coordinator report phrasing

`<KEY>` below is the work-item identifier the active playbook derives (`TICKET_KEY` for Jira, `ISSUE_SLUG` for GitHub).

For shared orchestration handoffs, pass the derived `<KEY>` value under the parameter name `TICKET_KEY`. In GitHub workflows, the value shape remains the GitHub `ISSUE_SLUG`; only the downstream alias changes.

## Orchestration Handoff Role

This contract defines the complete Phase 1 handoff. The coordinator and any top-level orchestrator retain the locked 12-line summary, the written file path, warnings, and fatal reason. Raw platform payloads and full artifact contents stay inside `work-item-retriever`.

`docs/<KEY>.md` is a workflow-state snapshot for downstream phases. Leave it on disk and unstaged; do not treat it as implementation history.

## Summary Semantics

| Field | Meaning |
| --- | --- |
| `FETCH: PASS` | Retrieval and validation succeeded with no known gaps |
| `FETCH: PARTIAL` | A valid artifact was written, but comments, related items, or discovery are incomplete (the active playbook enumerates the platform's partial-eligible sections) |
| `FETCH: FAIL` | Deterministic blocker: bad input, not found, auth, missing tools, or rate limit |
| `FETCH: ERROR` | Unexpected tool, schema, environment, or validation failure |
| `Validation: PASS` | Written artifact satisfies the template contract |
| `Validation: FAIL` | Artifact violates the contract after repair attempts |
| `Validation: NOT_RUN` | Retrieval stopped before assembly or validation |

Failure categories: `NONE`, `BAD_INPUT`, `NOT_FOUND`, `AUTH`, `TOOLS_MISSING`, `RATE_LIMIT`, `UNEXPECTED`.

## Count Rules

- `0/0` — verified empty section.
- `<retrieved>/UNKNOWN` — parent work item retrieved, but discovery for that section could not be verified; classify the run as `FETCH: PARTIAL`.
- `N/A` — parent work item was not retrieved, so downstream reads did not run.
- `Attachments: <N>` counts per the active playbook's `Summary Fields` definition; binaries are not downloaded.

## Locked Summary Line Order

Lines 5, 6, and 8 are platform-specific; the active playbook's `Summary Fields` section supplies them.

```text
FETCH: <PASS | PARTIAL | FAIL | ERROR>
Validation: <PASS | FAIL | NOT_RUN>
Failure category: <NONE | BAD_INPUT | NOT_FOUND | AUTH | TOOLS_MISSING | RATE_LIMIT | UNEXPECTED>
File written: <docs/<KEY>.md | None>
<playbook identifier line: e.g. "Ticket: <KEY>: <Summary>" / "Issue: <owner>/<repo>#<N>: <Title>">
<playbook status/state line: e.g. "Status: <s> | Type: <t>" / "State: <OPEN|CLOSED|Unknown>">
Comments: <retrieved>/<found | N/A>
<playbook children line: e.g. "Subtasks: ..." / "Child issues: ...">
Linked issues: <retrieved>/<found | UNKNOWN | N/A>
Attachments: <N | N/A>
Warnings: <None | semicolon-separated warnings>
Reason: <None | fatal reason>
```

<example>
FETCH: PASS
Validation: PASS
Failure category: NONE
File written: docs/PROJ-1234.md
Ticket: PROJ-1234: Implement dark mode toggle
Status: In Progress | Type: Story
Comments: 4/4
Subtasks: 3/3
Linked issues: 1/1
Attachments: 2
Warnings: None
Reason: None
</example>

<example>
FETCH: FAIL
Validation: NOT_RUN
Failure category: NOT_FOUND
File written: None
Issue: acme/app#892: Unknown
State: Unknown
Comments: N/A
Child issues: N/A
Linked issues: N/A
Attachments: N/A
Warnings: None
Reason: GitHub issue acme/app#892 was not found (404)
</example>

## Artifact Contract

Primary artifact: `docs/<KEY>.md`. It is the Phase 1 workflow-state snapshot consumed by later orchestration phases. The active playbook's `Snapshot Sections` section defines the required top-level heading order (stable when empty), and its named snapshot-template file defines the full fenced shape, conditional rules, and placeholders.

Shared rules across platforms:

- The preamble includes `Retrieved on`, a `Source` line, and the platform identity line from the snapshot template.
- Repeated nested headings appear only when the section has material or a required `Not retrieved` placeholder.
- Use `_None_` for verified empty sections; use the template's `_Unknown..._` markers when related-item or discovery results are unverified after the parent work item was retrieved.

## Coordinator Report Phrasing

For `PASS` or `PARTIAL`, report the file path, work-item identity, status/state, comment count, related-item counts, attachment count, warnings, and that the platform was not modified. When invoked by the top-level workflow, this report is the Phase 1 decision input before artifact validation. For `FAIL`, `ERROR`, or `Validation: FAIL`, report the failure category and reason without inspecting raw payloads.

<example>
Work item fetched to `docs/PROJ-1234.md`. `PROJ-1234: Implement dark mode
toggle` is `In Progress` (`Story`). Retrieved 4/4 comments, 3/3 subtasks,
1/1 linked issues, and 2 attachments. Retrieval only; the platform was not
modified.
</example>

<example>
Work item fetched to `docs/acme-app-7001.md` with retrieval warnings.
`acme/app#7001: Audit webhook retries` is `OPEN`. Retrieved 2/2 comments,
0/UNKNOWN child issues, 1/1 linked issues, and 0 attachments. Warning: Child
issue discovery unavailable: sub_issues endpoint unsupported on this host.
Retrieval only; the platform was not modified.
</example>

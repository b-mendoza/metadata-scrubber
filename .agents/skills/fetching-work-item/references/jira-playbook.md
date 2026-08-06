# Jira Fetch Playbook

> Read this file only after detecting the Jira platform. It is the per-platform fetch contract. Shared fetch policy lives in `./fetch-contract.md` and `./retrieval-playbook.md`.

## Inputs and Identifier

| Input      | Required | Example                                            |
| ---------- | -------- | -------------------------------------------------- |
| `JIRA_URL` | Yes      | `https://workspace.atlassian.net/browse/PROJ-1234` |

Workspace = subdomain before `.atlassian.net`. Project = prefix before the dash. **`TICKET_KEY`** = the final URL path segment and the `<KEY>` that names `docs/<KEY>.md`. If the URL is malformed or the key is not a Jira `PROJECT-1234` shape, return `FETCH: FAIL` with `Failure category: BAD_INPUT`.

## Transport / Read Path

Jira reads use read-only Jira tools (Jira MCP or equivalent). Prefer the most specific read-only tool per operation, then keep the mapping stable.

| Operation | Required capability |
| --- | --- |
| Parent issue | Read one Jira issue by key with fields and relationships |
| Comments | Read parent and related-item comments with pagination |
| Related issues | Retrieve subtasks and linked issues by key, parent fields, or verified search |
| Metadata | Resolve field names, attachment metadata, and custom fields without downloading binaries |

Return `AUTH` on denied access; `TOOLS_MISSING` when no Jira-capable read path covers the required operations.

## Capture Rules

Capture non-empty values among: key, summary; status, resolution, type, priority; assignee, reporter; labels, components, sprint, epic, fix/affects versions; created, updated, due; full description (formatting preserved); acceptance criteria; parent comments chronologically; attachment metadata; non-empty custom fields sorted by name. Serialize arrays as alphabetical comma-separated strings; structured custom-field values as compact JSON with sorted keys.

For acceptance criteria, use a dedicated Jira acceptance-criteria field first when Jira field metadata exposes one and it is non-empty. If no dedicated field is available, apply the shared precedence in `./retrieval-playbook.md` against the description. Do not duplicate a dedicated acceptance-criteria field under `## Custom Fields` after using it for `## Acceptance Criteria`.

## Relationships

Capture per subtask/linked issue: key, summary, status, assignee, type, full description, comments, and link type for linked issues (`blocks`, `is blocked by`, `relates`). Order subtasks by key, linked issues by link type then key, attachments by filename, custom fields by field name.

## Snapshot Sections

`docs/<TICKET_KEY>.md` heading order (stable when empty): `## Metadata`, `## Description`, `## Acceptance Criteria`, `## Comments`, `## Retrieval Warnings`, `## Subtasks`, `## Linked Issues`, `## Attachments`, `## Custom Fields`. Full template: `./jira-snapshot-template.md` (read at assembly).

## Summary Fields

Lines 5, 6, and 8 of the shared 12-line summary:

```text
Ticket: <TICKET_KEY>: <Summary/Title | Unknown>
Status: <status | Unknown> | Type: <type | Unknown>
Subtasks: <retrieved>/<found | UNKNOWN | N/A>
```

`Attachments:` counts metadata rows only; binaries are not downloaded.

## Rate-Limit Specifics

Honor `Retry-After` or `X-RateLimit-Reset`; preserve `RateLimit-Reason` in warnings or the fatal reason. Then apply the shared retry budget.

## External-Source Routing

Use the `Jira` group in `./external-sources.md` (`jira-rest-intro`, `jira-get-issue`, `jira-comments`, `jira-issue-links`, `jira-fields`, `jira-adf`, `jira-rate-limits`, etc.).

## Example Invocation

```yaml
JIRA_URL: https://workspace.atlassian.net/browse/PROJ-1234
```

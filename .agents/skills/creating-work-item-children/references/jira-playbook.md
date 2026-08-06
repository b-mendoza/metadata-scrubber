# Jira Child Work Item Playbook

> Load this file only after detecting Jira. It supplies every Jira-specific detail to the neutral coordinator and `child-work-item-creator`. Shared approval, idempotency, retry, repair, and status-pair policy lives in `./phase-4-io-contracts.md` and `./child-creation-playbook.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `JIRA_URL` | Yes for Phase 4 writes | `https://workspace.atlassian.net/browse/PROJ-123` |
| `TICKET_KEY` | Yes at dispatch; must equal URL ticket key | `PROJ-123` |
| `APPROVED_MUTATION_SCOPE` | Yes before mutation | `Create/reuse Jira subtasks for planned tasks and update docs/PROJ-123-tasks.md` |

Parse `https://<workspace>.atlassian.net/browse/<TICKET_KEY>` directly:

```text
Workspace = subdomain before .atlassian.net
Project hint = prefix before the dash in the URL key
<KEY> = TICKET_KEY from the final path segment
TICKET_KEY = <KEY> passed under the shared alias
```

Use Jira's verified project key from the parent response for metadata and create requests; the URL-derived project is only an input check. A missing/malformed URL or mismatched passed `TICKET_KEY` is `SUBTASKS: BLOCKED` with `Validation: NOT_RUN`.

Canonical parent reference: `<TICKET_KEY>`. Local artifact: `docs/<TICKET_KEY>-tasks.md`.

## Terminology and Mutation Model

Use these nouns exactly:

- Parent: Jira ticket/issue.
- Concrete child: Jira subtask whose `parent` is `TICKET_KEY` and whose issue type is a configured subtask type.
- Relationship: native Jira subtask relationship.
- Status: the project's actual Jira workflow status name returned by Jira.

Jira Phase 4 always uses native subtasks. There is no linked-issue chain and no `task-list` fallback. A task that cannot be created is `Not Created`.

Phase 4 scope creates/reuses subtasks and updates the plan. It does not transition, close, label, comment, or otherwise update subtask state.

## Transport and Failure Categories

Use the Jira MCP server or the most direct Jira-capable integration exposed by the environment. Prefer its native issue read, create-metadata, field-metadata, and create operations; use REST v3 only through an available approved transport.

Keep these failures distinguishable in `Reason:` and `Failures:` using the tag shown:

| Tag | Condition | Route |
| --- | --- | --- |
| `JIRA_MCP_DISCONNECTED` | Jira MCP/integration is unavailable or unresponsive | `SUBTASKS: FAIL`, `Validation: NOT_RUN` |
| `JIRA_ACCESS_DENIED` | Parent or metadata read is denied or inaccessible | `SUBTASKS: FAIL`, `Validation: NOT_RUN` |
| `JIRA_PERMISSION_FAILURE` | Create, parent assignment, or required field write is forbidden | `SUBTASKS: FAIL`, `Validation: NOT_RUN` or per-task failure when safely representable |
| `JIRA_PARENT_NOT_FOUND` | Parent does not exist or URL/key conflicts with returned identity | `SUBTASKS: FAIL`, `Validation: NOT_RUN` |
| `JIRA_SUBTASKS_DISABLED` | No createable subtask type exists or project disables subtasks | `SUBTASKS: FAIL`, `Validation: NOT_RUN` |
| `JIRA_SUBTASK_TYPE_AMBIGUOUS` | Multiple createable subtask types lack a deterministic approved choice | `SUBTASKS: BLOCKED`, `Validation: NOT_RUN` |
| `JIRA_REQUIRED_FIELD_UNAVAILABLE` | A required create field cannot be safely supplied | `SUBTASKS: FAIL`, `Validation: NOT_RUN` |
| `JIRA_RATE_LIMIT` | One 5-second retry is exhausted | Per-task failure; continue safely when possible, otherwise `FAIL` |

Do not collapse disconnected MCP, denied read access, and permission failure into a generic Jira error.

## Parent and Existing-Link Observation

Fetch the parent and capture verified key, project key, status, summary, and issue type. Use returned project identity for all later metadata checks.

For each existing concrete Jira key:

1. Fetch the issue and its parent and issue-type metadata.
2. Reuse it only when `parent == TICKET_KEY`, its type is configured as a subtask type, and its workflow task mapping does not conflict with another row.
3. Count verified matches as already linked.
4. Block if the key is invalid, belongs to another parent, is not a subtask, or conflicts with another task.
5. On resume, search narrowly by parent plus task summary/traceability before creating a replacement for an interrupted attempt.

## Create-Metadata Discovery

Run only when at least one task lacks verified linkage.

1. Query current project issue-type metadata for createable types marked as subtasks.
2. If none exist or subtasks are disabled, return `JIRA_SUBTASKS_DISABLED`.
3. If multiple exist, use a deterministic choice only when the plan, caller, local configuration, or exact approval identifies it. Record a warning.
4. If multiple exist without an approved deterministic choice, return `JIRA_SUBTASK_TYPE_AMBIGUOUS` and ask the user to choose.
5. Fetch create-field metadata for the selected subtask type.
6. Confirm every required field is satisfiable from current plan content, the parent response, field defaults, or metadata. Otherwise return `JIRA_REQUIRED_FIELD_UNAVAILABLE`.

Do not copy stale project defaults from memory.

## Jira Subtask Payload Template

For each missing subtask, summary:

```text
Task <N>: <Short title from plan>
```

Description section order is normative; transport encoding may be plain text, wiki markup, or ADF:

```text
Objective
<Objective text>

Relevant Requirements and Context
<Bullet list or paragraph>

Dependencies / Prerequisites
<Content or "None">

Questions to Answer Before Starting
<Content or "None - all resolved">

Implementation Notes
<Current clarified plan content>

Definition of Done
<Checklist or bullets>

Likely Files / Artifacts Affected
<List>
```

Create sequentially with verified project key, selected subtask issue type, parent key, summary, required fields, and description. If the transport requires ADF, preserve the same labels and order in ADF block nodes. Require a Jira-style issue key before counting success.

After creation, use the status returned by Jira. If absent, read the created subtask. If still unavailable, record `Unknown`; never assume `To Do` or another project-specific status.

## Plan Artifact Contract

Insert or replace one `## Jira Subtasks` table after `## Ticket Summary` when present; otherwise after the first top-level heading.

Fixed table:

```markdown
| Task | Subtask Key | Title | Status | Dependencies | Priority |
| ---- | ----------- | ----- | ------ | ------------ | -------- |
```

Column rules:

| Column         | Values                                                 |
| -------------- | ------------------------------------------------------ |
| `Task`         | Integer matching `## Task <N>:`                        |
| `Subtask Key`  | Concrete Jira key or `Not Created`                     |
| `Title`        | Task heading text                                      |
| `Status`       | Jira-returned status name, `Unknown`, or `Not Created` |
| `Dependencies` | Normalized `None`, `1`, `1,2`, etc.                    |
| `Priority`     | Plan value or `Unknown`                                |

The first line after each task heading is exactly:

```text
Jira Subtask: <KEY | Not Created>
```

The inline value must equal that row's `Subtask Key`. Use `Not Created` in both `Subtask Key` and `Status` when a create attempt fails. Jira never accepts `task-list` here.

## Structured Summary

Return exactly:

```text
SUBTASKS: PASS | WARN | FAIL | BLOCKED | ERROR
Validation: PASS | FAIL | NOT_RUN
Parent: <TICKET_KEY>
TICKET_KEY: <TICKET_KEY>
Plan file: <path | not updated>
Tasks in plan: <n>
Already linked: <n>
Created now: <n>
Failed creates: <n>
Decisions Log: PRESENT | MISSING
Reason: <one line>

Created/Linked Subtasks:
| Task | Subtask Key | Title | Dependencies | Priority | Outcome |
| ---- | ----------- | ----- | ------------ | -------- | ------- |

Warnings:
- <item or None>

Failures:
- <item or None>
```

`TICKET_KEY:` is required on every exit. Do not add GitHub `Write model:` or `Capability:` lines. When no safe task rows exist, use a header-only table.

### Blocked Placeholders

Before a valid URL is parsed:

- `Parent: UNKNOWN`
- `TICKET_KEY: UNKNOWN`
- `Plan file: not updated`
- all counts `0`
- `Decisions Log: MISSING`
- header-only linkage table
- `Reason:` names the URL or approval problem

After a valid URL but missing approval, use the derived key for `Parent:` and `TICKET_KEY:`, retain the other blocked values, and mutate nothing.

## Status Semantics

| Status | Meaning |
| --- | --- |
| `PASS` | Every task is linked to a verified Jira subtask and validation passed |
| `WARN` | Validation passed with missing decisions log, deterministic subtask-type warning, status uncertainty, optional nonfatal caveat, or individual creates represented as `Not Created` |
| `BLOCKED` | Approval, input, plan shape, existing linkage, identity, or ambiguous subtask-type choice is unsafe |
| `FAIL` | Parent lookup, transport/access/permission, configuration, required fields, all expected creates, boundary, or post-write validation failed |
| `ERROR` | Unexpected tool, filesystem, schema, or environment failure interrupted the run |

## Child-Reference Values and Downstream Readiness

- A concrete Jira key is usable when it resolves to a configured subtask whose parent is `TICKET_KEY` and whose task mapping is nonconflicting.
- `Not Created` requires manual resolution or a successful rerun before that task enters Phase 5.
- Jira accepts no degraded child-reference fallback; in particular, it never accepts `task-list`.

## Validation Checklist

- Exactly one `## Jira Subtasks` table exists.
- Table columns match the fixed order and one row exists per parsed task.
- Every concrete key exists, is a configured subtask type, and has parent `TICKET_KEY`.
- Every row has exactly one matching `Jira Subtask:` line.
- `Not Created` appears in both row and inline reference and requires `WARN`.
- No `task-list` value or GitHub write-model/capability field appears.
- Status values come from Jira or are `Unknown`; no project status is hardcoded.
- The only local file changed by this run is `docs/<TICKET_KEY>-tasks.md`.

## Rate Limits and External Sources

On a rate limit, wait 5 seconds and retry the same request once. Record `JIRA_RATE_LIMIT` if exhausted.

Use the `Jira Source Routing` group in `./external-sources.md`, especially `jira-issues-rest`, `jira-adf`, `jira-configure-subtasks`, `jira-auth`, `jira-rate-limits`, `jira-mcp-setup`, and `jira-mcp-troubleshooting`.

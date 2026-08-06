# Jira Workflow Playbook

> Read this file only after detecting the Jira platform from the input. It is the per-platform contract. Shared orchestration policy lives in `./workflow-policy.md`, `./phases-1-4.md`, `./task-loop.md`, `./data-contracts.md`, and `./error-handling.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `JIRA_URL` | Phase 1 and Jira writes | `https://workspace.atlassian.net/browse/JNS-6065` |
| `TICKET_KEY` | Resume / progress fallback | `JNS-6065` |

Workspace = subdomain before `.atlassian.net`. Project = prefix before the dash. **`TICKET_KEY`** is the final URL path segment and the stable workflow key consumed by shared references and subagents.

## Transport

Jira reads and writes use the Jira MCP server. Treat MCP unresponsiveness as transport unavailable; pause the workflow and ask the user to connect Jira MCP rather than failing.

## Phase Skill Map

| Phase | Runtime skill | Inputs | Retain |
| --- | --- | --- | --- |
| 1 | `fetching-work-item` | `JIRA_URL` | 12-line summary, `TICKET_KEY`, file path |
| 2 | `planning-work-item-tasks` | `TICKET_KEY` (+ `RE_PLAN`, `DECISIONS`) | summary, tasks file path, warnings |
| 3 | `clarifying-assumptions` | `TICKET_KEY`, `MODE=upfront`, `ITERATION` | `RE_PLAN_NEEDED`, `BLOCKERS_PRESENT`, decisions |
| 4 | `creating-work-item-children` | `JIRA_URL` | created/linked subtask rows, warnings, failures |
| 5 | `planning-task-execution` | `TICKET_KEY`, `TASK_NUMBER` (+ `RE_PLAN`, `DECISIONS_FILE`) | four artifact paths, approach, test shape, refactoring verdict |
| 6 | `clarifying-assumptions` | `TICKET_KEY`, `MODE=critique`, `TASK_NUMBER`, `ITERATION` | `RE_PLAN_NEEDED`, `BLOCKERS_PRESENT`, decisions file |
| 7 | `executing-work-item-task` | `TICKET_KEY`, `TASK_NUMBER` | `FINAL_TASK_REPORT` status, verdict, gate summary, retry counts |

## Phase 1 Snapshot Sections

`docs/<TICKET_KEY>.md` postcondition preserves this heading order (stable when empty): `## Metadata`, `## Description`, `## Acceptance Criteria`, `## Comments`, `## Retrieval Warnings`, `## Subtasks`, `## Linked Issues`, `## Attachments`, `## Custom Fields`.

## Phase 1 Fetch Summary Fields

Replace the platform placeholders in the shared 12-line contract with:

```text
Ticket: <TICKET_KEY>: <Summary/Title | Unknown>
Status: <status | Unknown> | Type: <type | Unknown>
Subtasks: <retrieved>/<found | UNKNOWN | N/A>
```

## Phase 2 Task Plan Summary Heading

`## Ticket Summary`

## Phase 3 Approval Prompt

```text
Plan is ready. How would you like to proceed?

1. Create subtasks in Jira now
2. Review the plan first
3. Stop here and create subtasks manually
```

## Phase 4 Child-Item Table and Write Model

Workflow-level: `## Jira Subtasks` table, one row per numbered task. Per-task: one inline `Jira Subtask:` line per numbered task section. Values: a concrete `<SUBTASK_KEY>` or `Not Created`. Always create native Jira subtasks; no fallback chain. `Not Created` requires manual resolution or Phase 4 rerun before Phase 5 for that task.

## Status-Check Contract

Transport: most direct Jira issue lookup the integration exposes. Output prefix: `TICKET_STATUS:`.

| Query type (neutral) | Jira alias | Output body |
| --- | --- | --- |
| `status` | `status` | Status, Assignee, Priority, Updated |
| `full` | `full` | Type+Status+Priority, Summary, Assignee, Labels, Sprint, Updated, Recent comments (≤5, ≤80 chars) |
| `children` | `subtasks` | Subtasks (≤20): `<KEY>: <title> [<status>] (<assignee>)` |

## Preflight Transport Check

Verify Jira-related MCP tools are available and responsive for phases that need Jira reads or writes: Phase 1 ticket fetch, Phase 4 subtask creation, and Phase 7 Jira-side kickoff or completion updates when the execution skill is eligible to perform them. Treat unresponsive or disconnected MCP as `MISSING` for the Jira MCP dependency.

## External-Source Routing

| Need                             | Section in `./external-sources.md` |
| -------------------------------- | ---------------------------------- |
| Setup / auth / MCP install help  | `Jira / Atlassian setup`           |
| Field name, endpoint, JQL syntax | `Jira REST API syntax`             |

## Example Invocation

```yaml
JIRA_URL: https://workspace.atlassian.net/browse/JNS-6065
```

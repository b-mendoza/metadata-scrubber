# GitHub Workflow Playbook

> Read this file only after detecting the GitHub platform from the input. It is the per-platform contract. Shared orchestration policy lives in `./workflow-policy.md`, `./phases-1-4.md`, `./task-loop.md`, `./data-contracts.md`, and `./error-handling.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `ISSUE_URL` | Preferred | `https://github.com/acme/app/issues/42` |
| `OWNER` / `REPO` / `ISSUE_NUMBER` | When URL absent | `acme` / `app` / `42` |
| `ISSUE_SLUG` | Resume / progress fallback | `acme-app-42` |

Parse `https://<host>/<owner>/<repo>/issues/<number>` (GitHub Enterprise included). Lowercase owner/repo. **`ISSUE_SLUG = <owner>-<repo>-<number>`** is the stable workflow key. Phase 4 child-issue creation requires `ISSUE_URL`.

## Transport

GitHub reads and writes use the `gh` CLI (`gh api` for REST or GraphQL). Treat missing `gh`, auth, or scope as transport unavailable; pause and ask the user to run `gh auth login` rather than failing.

## Phase Skill Map

| Phase | Runtime skill | Inputs | Retain |
| --- | --- | --- | --- |
| 1 | `fetching-work-item` | `ISSUE_URL` or `OWNER`+`REPO`+`ISSUE_NUMBER` | 12-line summary, `TICKET_KEY=<ISSUE_SLUG>`, file path |
| 2 | `planning-work-item-tasks` | `TICKET_KEY=<ISSUE_SLUG>` (+ `RE_PLAN`, `DECISIONS`) | summary, tasks file path, warnings |
| 3 | `clarifying-assumptions` | `TICKET_KEY=<ISSUE_SLUG>`, `MODE=upfront`, `ITERATION` | `RE_PLAN_NEEDED`, `BLOCKERS_PRESENT`, decisions |
| 4 | `creating-work-item-children` | `ISSUE_URL` | write model, created/linked task-issue rows, warnings |
| 5 | `planning-task-execution` | `TICKET_KEY=<ISSUE_SLUG>`, `TASK_NUMBER` (+ `RE_PLAN`, `DECISIONS_FILE`) | four artifact paths, approach, test shape, refactoring verdict |
| 6 | `clarifying-assumptions` | `TICKET_KEY=<ISSUE_SLUG>`, `MODE=critique`, `TASK_NUMBER`, `ITERATION` | `RE_PLAN_NEEDED`, `BLOCKERS_PRESENT`, decisions file |
| 7 | `executing-work-item-task` | `TICKET_KEY=<ISSUE_SLUG>`, `TASK_NUMBER` | `FINAL_TASK_REPORT` status, verdict, gate summary, retry counts |

`clarifying-assumptions` accepts `TICKET_KEY` as the workflow-key alias; pass the `ISSUE_SLUG` value under that name.

## Phase 1 Snapshot Sections

`docs/<ISSUE_SLUG>.md` preserves this heading order (stable when empty): `## Metadata`, `## Description`, `## Acceptance Criteria`, `## Comments`, `## Retrieval Warnings`, `## Child Issues`, `## Linked Issues`, `## Labels`, `## Assignees`, `## Milestone`, `## Projects`, `## Attachments`.

## Phase 1 Fetch Summary Fields

Replace the platform placeholders in the shared 12-line contract with:

```text
Issue: <owner>/<repo>#<N>: <Title | Unknown>
State: <OPEN | CLOSED | Unknown>
Child issues: <retrieved>/<found | UNKNOWN | N/A>
```

## Phase 2 Task Plan Summary Heading

`## Issue Summary`

## Phase 3 Approval Prompt

```text
Plan is ready. How would you like to proceed?

1. Create task issues on GitHub now
2. Review the plan first
3. Stop here and link issues manually
```

## Phase 4 Child-Item Table and Write Model

Workflow-level: `## GitHub Task Issues` heading, the machine handoff comment from `creating-work-item-children`, then a one-row-per-task table. Per-task: one inline `GitHub Task Issue:` line per numbered task section. Values: `owner/repo#number`, `Not Created`, or `task-list`. Write-model preference: native child issues → linked issues → task-list fallback. `task-list` is degraded and the user must accept it before that task's Phase 5 may begin.

## Status-Check Contract

Transport: `gh issue view` for direct lookups; `gh api` for REST or GraphQL. Output prefix: `ISSUE_STATUS:`.

| Query type (neutral) | GitHub aliases | Output body |
| --- | --- | --- |
| `status` | `status` | State, Title, Assignees, Labels, Updated |
| `full` | `full` | State+Labels, Title, Assignees, Updated, Body (≤200 chars), Recent comments (≤5, ≤80 chars) |
| `children` | `task-issues`, `subtasks` (deprecated) | Task issues (≤20): `<owner>/<repo>#<n>: <title> [<state>] (<assignee>)` |

If `gh` cannot enumerate `children`, return `ISSUE_STATUS: PARTIAL` and note linkage may live in `## GitHub Task Issues`.

## Preflight Transport Check

Run `gh --version` for any GitHub phase. For phases 1, 4, 7 also run `gh auth status` and treat logged-out or token failure as `MISSING`.

## External-Source Routing

| Need | Section in `./external-sources.md` |
| --- | --- |
| Setup / install / auth help | `GitHub CLI setup` |
| `gh` flag, JSON field, REST/GraphQL endpoint | `GitHub CLI / API syntax` |
| Sub-issues, dependencies, projects v2 capabilities | `GitHub Issues capabilities` |

## Example Invocation

```yaml
ISSUE_URL: https://github.com/acme/app/issues/42
```

# GitHub Execution Playbook

> Load only after detecting GitHub. This file owns every GitHub-specific identifier, transport, capability, terminology, task-reference, tracker mutation, report-field, rate-limit, and external-source decision. Shared readiness and routing live in `./contracts.md` and `./pipeline.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `TICKET_KEY` | Yes after normalization | `acme-app-42` (the GitHub `ISSUE_SLUG` value passed under the workflow-key alias) |
| `ISSUE_SLUG` | Accepted only as a direct-call compatibility input when `TICKET_KEY` is absent | `acme-app-42` |
| `ISSUE_URL` | Preferred tracker locator when tracker actions may run | `https://github.com/acme/app/issues/42` |
| `OWNER` / `REPO` / `ISSUE_NUMBER` | When URL is absent and tracker actions need coordinates | `acme` / `app` / `42` |
| `TASK_NUMBER` | Yes | `3` |

Derive `<KEY>` as the GitHub issue slug `<owner>-<repo>-<number>`. Normalize a legacy direct `ISSUE_SLUG` input by passing its value unchanged under `TICKET_KEY`; this does not create a second workflow-key alias. Do not split a slug to recover owner/repo when names contain dashes. Resolve canonical owner/repo/number from `ISSUE_URL`, structured coordinates, or the Phase 1 snapshot and task plan. If platform identity remains ambiguous, stop for input.

## Transport / Capability Policy

GitHub reads and writes use `gh`; use `gh api` for REST or GraphQL when the high-level issue commands do not expose a required action. Preserve a non- `github.com` host from `ISSUE_URL`.

Assess capability before kickoff:

- Missing `gh`, failed authentication, missing scope, or unsupported host capability is recorded in `KICKOFF_REPORT`.
- Optional startup or completion mutations become `skipped` and local implementation may continue when workspace readiness is otherwise satisfied.
- A missing capability blocks only when the approved brief, task plan, or team policy makes that exact tracker mutation mandatory.

## Rate-Limit Specifics

Honor `retry-after` or `x-ratelimit-reset`. For a secondary limit without explicit timing, wait at least 60 seconds, then apply the [shared bounded rate-limit policy](./retry-and-escalation.md#rate-limit-retries). Preserve the rate-limit message in the blocker or skip reason.

## Task Plan Tracking Contract

| Concept | GitHub value |
| --- | --- |
| Workflow-level section | `## GitHub Task Issues` |
| Per-task inline field | `GitHub Task Issue: <value>` |
| Primary lookup precedence | Inline field first, matching table row second |
| Concrete child reference | `owner/repo#number` |
| Degraded references | `task-list`, `Not Created`, or missing |
| Parent reference | Canonical parent `owner/repo#number` from the snapshot/locator |
| Current-item mode | `current-child-issue`; use the repeated branch for the selected task row |

Accepted task-reference values are `owner/repo#number`, `task-list`, `Not Created`, or missing. A concrete child issue provides full traceability. `task-list`, `Not Created`, or missing does not block local implementation, but limits tracker actions. Never treat a task-list row as a native child issue.

## Capture Rules and Section Headings

- The Phase 1 artifact is an issue snapshot at `docs/<KEY>.md`.
- The task plan is `docs/<KEY>-tasks.md` and uses `## GitHub Task Issues` plus per-task `GitHub Task Issue:` fields when that tracking data exists.
- Resolve the planner branch from the selected `## Task <N>:` section's `**Branch name:**` field first, then `## Execution Order Summary`.

## Terminology

Preserve GitHub nouns such as parent issue, child issue, sub-issue, task-list, label, assignee, project, milestone, close, and reopen. Do not translate them into Jira subtask or transition terminology.

## Kickoff Actions

Before kickoff, do not label, assign, or comment for the purpose of starting implementation. After readiness and the execution boundary:

1. Resolve the child reference and parent reference using the tracking contract.
2. For a concrete issue and available capability, perform only actions required by approved artifacts or policy: label changes, assignee changes, kickoff comment on child or parent, or explicitly required project/milestone update.
3. Treat kickoff as idempotent. If the intended label, assignee, or comment already exists, report the current state without duplicating the mutation.
4. For `task-list`, `Not Created`, missing references, or optional unavailable capability, report `skipped` with a reason.

## Final Completion Actions

Final GitHub completion is forbidden during `UPDATE_TRACKING`. In `FINALIZE_TRACKER`, after requirements verification and all three quality gates are non-blocking:

1. Update the selected task's completion metadata and, when `## GitHub Task Issues` is present, update the selected row to reflect the current tracker state or completion notes.
2. For a concrete child issue, optionally add a completion comment, close the issue, or change labels only when approved artifacts or policy call for it.
3. For a task-list or absent concrete issue, record the exact degraded update or skip; do not claim a child issue was closed.
4. Missing capability blocks only a mandatory completion action; otherwise the report records an explicit skip.

## Summary Field Shapes

The shared templates remain structurally neutral. Fill these playbook-defined values:

```text
Work item reference: Issue `<ISSUE_SLUG>`
Tracker primary reference: <owner/repo#number | task-list | Not Created | None>
Tracker secondary reference: <parent owner/repo#number | None>
Kickoff action vocabulary: labels | assignee | comment on child | comment on parent | project | milestone | none
Completion action vocabulary: comment | close | reopen | label change | project | milestone | none
Tracker result: done | skipped | blocked
```

`FINAL_TASK_REPORT` uses the neutral `Work item:` field with the `<KEY>` value; put GitHub-specific action details only under `Tracker Updates`.

## External-Source Routing

Read `./external-sources.md` and use only the `GitHub Sources` group when exact current behavior changes the next action. Relevant keys include `gh-manual`, `github-issues`, `github-sub-issues`, `github-rest-issues`, and `github-rate-limits`. Fetch at most two pages per phase.

## Example

```yaml
TICKET_KEY: acme-app-42
TASK_NUMBER: 3
ISSUE_URL: https://github.com/acme/app/issues/42
```

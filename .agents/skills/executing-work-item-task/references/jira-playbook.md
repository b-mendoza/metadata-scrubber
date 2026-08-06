# Jira Execution Playbook

> Load only after detecting Jira. This file owns every Jira-specific identifier, transport, capability, terminology, subtask-reference, tracker mutation, report-field, rate-limit, and external-source decision. Shared readiness and routing live in `./contracts.md` and `./pipeline.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `TICKET_KEY` | Yes | `JNS-6065` |
| `JIRA_URL` | Preferred when Jira actions may run | `https://workspace.atlassian.net/browse/JNS-6065` |
| `TASK_NUMBER` | Yes | `3` |

Workspace is the subdomain before `.atlassian.net`; project is the prefix before the numeric suffix. `<KEY>` is the Jira ticket key and is passed unchanged under the established `TICKET_KEY` alias. The parent ticket or selected subtask may be looked up through `JIRA_URL`, the ticket key, or the Phase 1 snapshot and task plan. If platform identity remains ambiguous, stop for input.

## Transport / Capability Policy

Jira reads and writes use the available Jira MCP integration or equivalent Jira-capable transport. Prefer the most specific issue lookup or mutation tool and keep that mapping stable for the run.

Assess capability before kickoff:

- Disconnected, unresponsive, unauthenticated, or unauthorized transport is recorded in `KICKOFF_REPORT`.
- Optional startup or completion mutations become `skipped` and local implementation may continue when workspace readiness is otherwise satisfied.
- A missing capability blocks only when the approved brief, task plan, or team policy makes that exact Jira mutation mandatory.

## Rate-Limit Specifics

Honor `Retry-After` or `X-RateLimit-Reset` and preserve `RateLimit-Reason`, then apply the [shared bounded rate-limit policy](./retry-and-escalation.md#rate-limit-retries).

## Task Plan Tracking Contract

| Concept | Jira value |
| --- | --- |
| Workflow-level section | `## Jira Subtasks` |
| Per-task inline field | `Jira Subtask: <SUBTASK_KEY>` |
| Primary lookup precedence | Inline field first, matching table row second |
| Concrete child reference | Jira subtask key such as `JNS-6071` |
| Degraded references | `Not Created` or missing |
| Parent reference | Parent `TICKET_KEY` |
| Current-item mode | `current-subtask`; use the repeated branch for the selected task row |

Missing or `Not Created` linkage does not block local implementation, but limits Jira-side updates. Jira subtasks are native children; do not translate them into GitHub child issues, task lists, labels, or close/reopen operations.

## Capture Rules and Section Headings

- The Phase 1 artifact is a ticket snapshot at `docs/<KEY>.md`.
- The task plan is `docs/<KEY>-tasks.md` and uses `## Jira Subtasks` plus per-task `Jira Subtask:` fields when that tracking data exists.
- Resolve the planner branch from the selected `## Task <N>:` section's `**Branch name:**` field first, then `## Execution Order Summary`.

## Terminology

Preserve Jira nouns such as parent ticket, issue, subtask, status, transition, resolution, workflow, `In Progress`, and `Done`. Do not translate them into GitHub child-issue, task-list, label, or close/reopen terminology.

## Kickoff Actions

Before kickoff, do not transition a subtask or post a start-of-execution comment. After readiness and the execution boundary:

1. Resolve the concrete subtask key from the tracking contract.
2. When the key and capability exist, perform only approved startup actions, such as a valid transition toward `In Progress` or a kickoff comment.
3. Discover available transitions rather than assuming a transition name or ID.
4. Treat kickoff as idempotent. If the current status already represents active execution or the intended comment already exists, report current state and do not duplicate the mutation.
5. For `Not Created`, missing references, or optional unavailable capability, report `skipped` with a reason.

## Final Completion Actions

Final Jira completion is forbidden during `UPDATE_TRACKING`. In `FINALIZE_TRACKER`, after requirements verification and all three quality gates are non-blocking:

1. Update the selected task's completion metadata and, when `## Jira Subtasks` is present, update the selected row to reflect the current Jira state, typically a Done-category status after successful completion.
2. If the subtask key and capability exist, discover and apply the appropriate completion transition (commonly to a Done-category status) or add a short completion comment only when approved artifacts or policy call for it.
3. Do not hardcode `Done` as a transition ID or assume every workflow exposes the same status name.
4. Missing capability blocks only a mandatory completion action; otherwise the report records an explicit skip.

## Summary Field Shapes

The shared templates remain structurally neutral. Fill these playbook-defined values:

```text
Work item reference: Ticket `<TICKET_KEY>`
Tracker primary reference: <SUBTASK_KEY | Not Created | None>
Tracker secondary reference: <parent TICKET_KEY | None>
Kickoff action vocabulary: transition | comment | none
Completion action vocabulary: transition | comment | resolution update | none
Tracker result: done | skipped | blocked
```

`FINAL_TASK_REPORT` uses the neutral `Work item:` field with the `<KEY>` value; put Jira-specific transition and status details only under `Tracker Updates`.

## External-Source Routing

Read `./external-sources.md` and use only the `Jira Sources` group when exact current behavior changes the next action. Relevant keys include `jira-mcp-setup`, `jira-issues-subtasks`, `jira-workflows`, `jira-rest`, and `jira-rate-limits`. Fetch at most two pages per phase.

## Example

```yaml
TICKET_KEY: JNS-6065
TASK_NUMBER: 3
JIRA_URL: https://workspace.atlassian.net/browse/JNS-6065
```

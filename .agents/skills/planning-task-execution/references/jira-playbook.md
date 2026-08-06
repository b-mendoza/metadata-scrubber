# Jira Task-Execution Planning Playbook

> Read this file only after detecting Jira. It is the complete platform-specific contract for Phase 5 planning. Shared pipeline, artifact, validation, and summary-example rules live in the other bundled references.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `TICKET_KEY` | Yes | `JNS-6065` |
| `TASK_NUMBER` | Yes | `3` |
| `INVOCATION_MODE` | Yes for readiness validation | `orchestrated` or `standalone` |

Validate `TICKET_KEY` as a Jira key `<PROJECT>-<number>` with exactly one dash before the numeric suffix and no dash inside the project segment. Preserve the validated ticket key as **`<KEY>`** for every shared reference, subagent input, and artifact path.

If the key is missing, malformed, or ambiguous with a GitHub issue slug, stop before dispatch and request the canonical Jira ticket key or Jira URL.

## Transport and Mutation Boundary

This Phase 5 skill is local-only. Read `docs/<KEY>-tasks.md`, optional `docs/<KEY>.md`, decisions, and relevant repository files. Do not call Jira MCP or any Jira REST write/read operation during normal planning. Do not comment, transition, label, close, edit, create subtasks, link issues, or otherwise mutate Jira.

Optional public methodology pages are fetched only through the routing below; they are evidence, not Jira ticket transport.

## Capture Rules

`execution-prepper` captures only the selected numbered task's common fields, resolved decisions, dependency state, question state, and any ticket context needed to make the brief self-contained. It may consult `docs/<KEY>.md` only when the task plan lacks necessary context. Do not copy unrelated tasks or raw Jira payloads into the brief or coordinator summary.

Downstream subagents consume the selected-task artifact paths and verify the same `<KEY>` and `TASK_NUMBER`; they do not re-read the whole Jira task plan.

## Task-Plan Integration and Terminology

Use these Jira semantics exactly:

| Concept                               | Jira term or heading |
| ------------------------------------- | -------------------- |
| Parent work item                      | ticket / issue       |
| Phase 4 work item for a numbered task | subtask              |
| Native hierarchy relationship         | Jira subtask         |
| Workflow-level subtask section        | `## Jira Subtasks`   |
| Per-task inline field                 | `Jira Subtask:`      |
| Missing Phase 4 result                | `Not Created`        |

When `INVOCATION_MODE=orchestrated`, require `## Jira Subtasks` plus the selected task's inline field and a concrete subtask key. `Not Created` requires manual resolution or a Phase 4 rerun before planning this task. When `INVOCATION_MODE=standalone`, the table and inline field may be absent; if they are present, apply the same subtask readiness semantics. Task readiness in either mode still must pass the shared dependency and question checks.

Never translate Jira `subtask` or `transition` semantics into GitHub child issue, task-list, close, or label behavior.

## Platform-Owned Section Headings

The shared task-section field list and all four output templates are platform neutral. Jira owns only these optional upstream integration markers:

```text
## Jira Subtasks
Jira Subtask:
```

Treat `## Decisions Log`, when present, as later authority over earlier task wording.

## Summary Fields

The Jira playbook owns the rendered summary paths and permissible platform nouns. Use these exact shapes with the Jira `<KEY>`:

```text
PREP: PASS|FAIL|BLOCKED|ERROR
Task: <TASK_NUMBER> - <Task Title>
Brief: docs/<KEY>-task-<TASK_NUMBER>-brief.md | Not written
Dependencies: <Satisfied | Unsatisfied: ...>
Questions: <Resolved | Unresolved: ...>
References fetched: <exact URLs or none>
Notes: <one concise line, or None>
```

```text
PLAN: PASS|FAIL|BLOCKED|ERROR
Execution plan: docs/<KEY>-task-<TASK_NUMBER>-execution-plan.md | Not written
Recommended skills: <comma-separated list or None>
References fetched: <exact URLs or none>
Approach: <one or two sentences>
Blockers: <list or None>
```

```text
TEST_SPEC: PASS|FAIL|BLOCKED|ERROR
Spec: docs/<KEY>-task-<TASK_NUMBER>-test-spec.md | Not written
Framework: <framework or Unknown>
References fetched: <exact URLs or none>
Coverage: <short description of groups and priorities>
Blockers: <list or None>
```

```text
REFACTORING: PASS|FAIL|BLOCKED|ERROR
Refactoring plan: docs/<KEY>-task-<TASK_NUMBER>-refactoring-plan.md | Not written
Verdict: <Refactor before | Refactor during | No refactoring needed>
References fetched: <exact URLs or none>
Summary: <one concise line>
Blockers: <list or None>
```

Platform-specific notes may say `ticket` or `Jira subtask`; they must not claim Jira was modified.

## Rate-Limit Specifics

No Jira MCP or REST call is permitted in this phase, so Jira rate-limit handling is not applicable. For optional public methodology fetches, apply the shared maximum of two pages per stage and continue from bundled contracts when a page is unavailable.

## External-Source Routing

Use the `Jira task readiness and acceptance` group in `./external-sources.md` when story, acceptance, or Jira-adjacent readiness framing could change the brief. Use shared planning, testing, and refactoring groups for all other methodology decisions. Prefer zero fetches on routine runs.

## Example Invocation

```yaml
TICKET_KEY: JNS-6065
TASK_NUMBER: 3
```

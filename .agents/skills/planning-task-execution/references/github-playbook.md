# GitHub Task-Execution Planning Playbook

> Read this file only after detecting GitHub. It is the complete platform-specific contract for Phase 5 planning. Shared pipeline, artifact, validation, and summary-example rules live in the other bundled references.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `TICKET_KEY` | Preferred shared workflow alias | `acme-app-42` |
| `ISSUE_SLUG` | Direct-invocation compatibility when the alias is absent | `acme-app-42` |
| `TASK_NUMBER` | Yes | `3` |
| `INVOCATION_MODE` | Yes for readiness validation | `orchestrated` or `standalone` |

Validate the GitHub issue slug as `<owner>-<repo>-<number>`, with at least two name segments before the numeric suffix. Preserve the supplied normalized slug as **`<KEY>`**. When only `ISSUE_SLUG` is supplied, pass the same value under `TICKET_KEY` for every shared reference and subagent.

If the slug is missing, malformed, or ambiguous with a Jira key, stop before dispatch and request the canonical issue slug or issue URL-derived slug.

## Transport and Mutation Boundary

This Phase 5 skill is local-only. Read `docs/<KEY>-tasks.md`, optional `docs/<KEY>.md`, decisions, and relevant repository files. Do not call `gh`, the GitHub REST API, or GraphQL during normal planning. Do not comment, label, close, reopen, edit, link, create child issues, or otherwise mutate GitHub.

Optional public methodology pages are fetched only through the routing below; they are evidence, not GitHub work-item transport.

## Capture Rules

`execution-prepper` captures only the selected numbered task's common fields, resolved decisions, dependency state, question state, and any issue context needed to make the brief self-contained. It may consult `docs/<KEY>.md` only when the task plan lacks necessary context. Do not copy unrelated tasks or raw issue payloads into the brief or coordinator summary.

Downstream subagents consume the selected-task artifact paths and verify the same `<KEY>` and `TASK_NUMBER`; they do not re-read the whole issue task plan.

## Task-Plan Integration and Terminology

Use these GitHub semantics exactly:

| Concept                               | GitHub term or heading  |
| ------------------------------------- | ----------------------- |
| Parent work item                      | issue                   |
| Phase 4 work item for a numbered task | GitHub task issue       |
| Native hierarchy relationship         | child issue / sub-issue |
| Alternate relationship                | linked issue            |
| Degraded fallback                     | task-list               |
| Workflow-level task-link section      | `## GitHub Task Issues` |
| Per-task inline field                 | `GitHub Task Issue:`    |

When `INVOCATION_MODE=orchestrated`, require `## GitHub Task Issues` plus the selected task's inline field and either a concrete native relationship reference (child issue, sub-issue, or linked issue), or an explicitly accepted `task-list` fallback. A `task-list` value is degraded and requires the earlier explicit user acceptance recorded by the workflow before this task may begin Phase 5. `Not Created` is not a valid orchestrated Phase 5 handoff. When `INVOCATION_MODE=standalone`, the table and inline field may be absent; if they are present, apply the same relationship semantics. Task readiness in either mode still must pass the shared dependency and question checks.

Never translate `child issue`, `linked issue`, or `task-list` into Jira `subtask` semantics.

## Platform-Owned Section Headings

The shared task-section field list and all four output templates are platform neutral. GitHub owns only these optional upstream integration markers:

```text
## GitHub Task Issues
GitHub Task Issue:
```

Treat `## Decisions Log`, when present, as later authority over earlier task wording.

## Summary Fields

The GitHub playbook owns the rendered summary paths and permissible platform nouns. Use these exact shapes with the GitHub `<KEY>` slug:

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

Platform-specific notes may say `issue` or `GitHub task issue`; they must not claim GitHub was modified.

## Rate-Limit Specifics

No GitHub API or CLI call is permitted in this phase, so GitHub rate-limit handling is not applicable. For optional public methodology fetches, apply the shared maximum of two pages per stage and continue from bundled contracts when a page is unavailable.

## External-Source Routing

Use the `GitHub task readiness and acceptance` group in `./external-sources.md` when issue or issue-form framing could change the brief. Use shared planning, testing, and refactoring groups for all other methodology decisions. Prefer zero fetches on routine runs.

## Example Invocation

```yaml
TICKET_KEY: acme-app-42
TASK_NUMBER: 3
```

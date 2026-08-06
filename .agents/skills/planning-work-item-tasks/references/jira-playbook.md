# Jira Task-Planning Playbook

> Read this file only after detecting Jira. It owns every Jira-specific Phase 2 detail: accepted identifiers, local transport boundary, snapshot headings, child-work semantics, output nouns and headings, summary field labels, branch identifier shape, rate-limit applicability, and external-source routing. Shared planning logic lives in the other files in this directory.

## Inputs and Identifier

| Input        | Required | Example    |
| ------------ | -------- | ---------- |
| `TICKET_KEY` | Yes      | `JNS-6065` |

`TICKET_KEY` must match a Jira key shape with one project segment and a numeric suffix, such as `JNS-6065`. Its value is `<KEY>` and names `docs/<KEY>.md` plus every Phase 2 artifact. Phase 2 is file-driven: `docs/<KEY>.md` must already exist as the Phase 1 Jira snapshot. Preserve the supplied key's spelling for artifact paths; lowercase it only when deriving branch names.

## Transport, Mutation, and Rate Limits

Phase 2 uses local file reads and writes only. It does not call Jira MCP or Jira REST, and it does not create, edit, transition, assign, link, or close tickets or subtasks. Jira rate limits therefore do not apply. If current Jira hierarchy semantics are needed for a planning judgment, use the optional source routing below without mutating Jira.

## Vocabulary and Output Tokens

| Token                           | Jira value                 |
| ------------------------------- | -------------------------- |
| Work-item noun                  | `ticket`                   |
| Child-item noun                 | `subtask`                  |
| Child-work section              | `## Subtasks`              |
| Current-item mode               | `Current-Subtask Mode`     |
| Task-plan summary heading       | `## Ticket Summary`        |
| Identity summary line           | `TICKET_KEY: <KEY>`        |
| Current-mode summary line       | `Current-subtask mode: yes | no  | unknown` |
| Validation-report identity line | `> TICKET_KEY: <KEY>`      |
| Child-coverage check label      | `Subtask coverage`         |

Render these exact Jira values wherever a shared template uses the corresponding token. Do not substitute GitHub nouns such as `child issue` or `sub-issue`.

## Required Snapshot Headings

Preflight requires this exact ordered list. Do not validate a Jira/GitHub union:

1. `## Metadata`
2. `## Description`
3. `## Acceptance Criteria`
4. `## Comments`
5. `## Retrieval Warnings`
6. `## Subtasks`
7. `## Linked Issues`
8. `## Attachments`
9. `## Custom Fields`

## Planning Capture Rules

Use `## Description`, `## Acceptance Criteria`, and actionable `## Comments` as requirements sources. Preserve visible retrieval gaps from `## Retrieval Warnings` as assumptions or questions rather than silently filling them. Use `## Subtasks` as the child-coverage source: map each concrete subtask to a planned task, explain consolidation, or mark it explicitly out of scope. Use `## Linked Issues` for dependency context, `## Custom Fields` for additional requirements or constraints, and `## Attachments` as supporting context without downloading or rewriting binaries.

## Current-Item Detection and Required Wording

Enter Current-Subtask Mode when `## Metadata` indicates the current ticket is a Jira subtask, or when other authoritative snapshot content shows it is already child work.

When active, write this exact note under `## Notes`:

```markdown
Subtask scope: This ticket is already a Jira subtask. Downstream Jira subtask creation should be skipped; implementation should stay on one branch/PR for the current subtask.
```

Write this exact sentence below the execution-order table, substituting the resolved branch name:

```markdown
Subtask creation mode: skip downstream Jira subtask creation because this ticket is already a subtask. Execute all tasks on `<branch-name>` in one PR.
```

In this mode, keep all tasks on one branch and do not create or recommend subtasks of the subtask. A single execution task is allowed only when further splitting would invent subtasks rather than clarify execution; record the justification under `## Notes`.

## Branch Identifier

The branch identifier is the lowercase Jira ticket key.

- Parent-ticket mode: `<prefix><ticket-key-lower>-task-<n>-<task-title-slug>`
- Current-Subtask Mode: `<prefix><ticket-key-lower>-<ticket-title-slug>`

The shared dependency guide defines `prefix` selection and the deterministic slug algorithm. Current-Subtask Mode repeats the same branch for every task.

## External-Source Routing

| Need                                      | Key in `./external-sources.md` |
| ----------------------------------------- | ------------------------------ |
| Jira parent / subtask hierarchy semantics | `jira-subtasks`                |
| Git branch ref-name validity              | `git-check-ref-format`         |

## Example Invocation

```yaml
TICKET_KEY: JNS-6065
```

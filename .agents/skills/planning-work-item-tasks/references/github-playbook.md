# GitHub Task-Planning Playbook

> Read this file only after detecting GitHub. It owns every GitHub-specific Phase 2 detail: accepted identifiers, local transport boundary, snapshot headings, child-work semantics, output nouns and headings, summary field labels, branch identifier shape, rate-limit applicability, and external-source routing. Shared planning logic lives in the other files in this directory.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `TICKET_KEY` | Preferred shared alias | `acme-app-42` |
| `ISSUE_SLUG` | Standalone compatibility when `TICKET_KEY` is absent | `acme-app-42` |

Exactly one workflow-key value is required. When `ISSUE_SLUG` is supplied, normalize it internally to `TICKET_KEY=<ISSUE_SLUG>`. If both are supplied, they must match exactly. The value must have at least two dash-separated name segments before a numeric suffix. The normalized value is `<KEY>` and names `docs/<KEY>.md` plus every Phase 2 artifact.

Phase 2 is file-driven: `docs/<KEY>.md` must already exist as the Phase 1 GitHub issue snapshot. Preserve the supplied key's spelling for artifact paths; lowercase it only when deriving branch names.

## Transport, Mutation, and Rate Limits

Phase 2 uses local file reads and writes only. It does not call `gh`, GitHub REST, or GitHub GraphQL, and it does not create, edit, close, label, link, or transition issues. GitHub rate limits therefore do not apply. If current GitHub hierarchy semantics are needed for a planning judgment, use the optional source routing below without mutating GitHub.

## Vocabulary and Output Tokens

| Token                           | GitHub value                   |
| ------------------------------- | ------------------------------ |
| Work-item noun                  | `issue`                        |
| Child-item noun                 | `child issue`                  |
| Child-work section              | `## Child Issues`              |
| Current-item mode               | `Current-Child-Issue Mode`     |
| Task-plan summary heading       | `## Issue Summary`             |
| Identity summary line           | `ISSUE_SLUG: <KEY>`            |
| Current-mode summary line       | `Current-child-issue mode: yes | no  | unknown` |
| Validation-report identity line | `> ISSUE_SLUG: <KEY>`          |
| Child-coverage check label      | `Child issue coverage`         |

Render these exact GitHub values wherever a shared template uses the corresponding token. Do not substitute Jira nouns such as `subtask`.

## Required Snapshot Headings

Preflight requires this exact ordered list. Do not validate a Jira/GitHub union:

1. `## Metadata`
2. `## Description`
3. `## Acceptance Criteria`
4. `## Comments`
5. `## Retrieval Warnings`
6. `## Child Issues`
7. `## Linked Issues`
8. `## Labels`
9. `## Assignees`
10. `## Milestone`
11. `## Projects`
12. `## Attachments`

## Planning Capture Rules

Use `## Description`, `## Acceptance Criteria`, and actionable `## Comments` as requirements sources. Preserve visible retrieval gaps from `## Retrieval Warnings` as assumptions or questions rather than silently filling them. Use `## Child Issues` as the child-coverage source: map each concrete child issue to a planned task, explain consolidation, or mark it explicitly out of scope. Use `## Linked Issues` for dependency context and labels, assignees, milestone, and projects as planning context without inventing platform mutations. Attachments may supply supporting context but are not downloaded or rewritten.

## Current-Item Detection and Required Wording

Enter Current-Child-Issue Mode when `## Metadata` indicates the current issue is itself a GitHub child issue or sub-issue, or when other authoritative snapshot content shows it is already child work.

When active, write this exact note under `## Notes`:

```markdown
Child-issue scope: This issue is already a GitHub child issue or sub-issue. Downstream child-issue creation should be skipped; implementation should stay on one branch/PR for the current issue.
```

Write this exact sentence below the execution-order table, substituting the resolved branch name:

```markdown
Child-issue creation mode: skip downstream GitHub child-issue creation because this issue is already child work. Execute all tasks on `<branch-name>` in one PR.
```

In this mode, keep all tasks on one branch and do not create or recommend child issues of the child issue. A single execution task is allowed only when further splitting would invent child issues rather than clarify execution; record the justification under `## Notes`.

## Branch Identifier

The branch identifier is the lowercase GitHub issue slug.

- Parent-issue mode: `<prefix><issue-slug-lower>-task-<n>-<task-title-slug>`
- Current-Child-Issue Mode: `<prefix><issue-slug-lower>-<issue-title-slug>`

The shared dependency guide defines `prefix` selection and the deterministic slug algorithm. Current-Child-Issue Mode repeats the same branch for every task.

## External-Source Routing

| Need | Key in `./external-sources.md` |
| --- | --- |
| GitHub parent / sub-issue hierarchy semantics | `github-sub-issues` |
| GitHub issue types and label behavior | `github-issue-types` |
| Git branch ref-name validity | `git-check-ref-format` |

## Example Invocation

Orchestrated:

```yaml
TICKET_KEY: acme-app-42
```

Standalone compatibility:

```yaml
ISSUE_SLUG: acme-app-42
```

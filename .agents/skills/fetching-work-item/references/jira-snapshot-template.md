# Jira Snapshot Template

> Read this file only during document assembly, and only when the active platform is Jira. Copy the fenced Markdown shape below into `docs/<TICKET_KEY>.md`. Prose outside the fence is retriever instruction, not output content.

## Contents

- Snapshot shape
- Conditional rules
- Missing subtask placeholder
- Missing linked issue placeholder

Every top-level heading in the fenced block is required. Repeated nested headings are shapes for items that exist or required `Not retrieved` placeholders. Write `_None_` for verified empty sections. Use the `_Unknown..._` markers from **Conditional Rules** when subtask or linked-issue discovery is unverified after the parent ticket was retrieved. The rendered file is a Phase 1 workflow-state handoff for downstream orchestration phases and should remain unstaged.

```markdown
# <TICKET_KEY>: <Summary>

> Retrieved on: <YYYY-MM-DD HH:MM UTC> Source: <JIRA_URL> Workspace: <workspace> | Project: <project> | Ticket: <TICKET_KEY>

## Metadata

| Field           | Value |
| --------------- | ----- |
| Ticket Key      | ...   |
| Workspace       | ...   |
| Project         | ...   |
| Status          | ...   |
| Resolution      | ...   |
| Type            | ...   |
| Priority        | ...   |
| Assignee        | ...   |
| Reporter        | ...   |
| Labels          | ...   |
| Components      | ...   |
| Sprint          | ...   |
| Epic            | ...   |
| Fix Version     | ...   |
| Affects Version | ...   |
| Created         | ...   |
| Updated         | ...   |
| Due Date        | ...   |
| URL             | ...   |

## Description

<full description body after acceptance-criteria extraction, or _None_>

## Acceptance Criteria

<acceptance criteria, or _None_>

## Comments

### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

### Comment 2 - ...

## Retrieval Warnings

- <warning text>

## Subtasks

### <SUBTASK_KEY>: <Summary>

- **Status:** ...
- **Assignee:** ...
- **Type:** ...

#### Description

<body or _None_>

#### Comments

##### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

## Linked Issues

### <LINK_TYPE>: <ISSUE_KEY> - <Summary>

- **Status:** ...
- **Assignee:** ...
- **Type:** ...

#### Description

<body or _None_>

#### Comments

##### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

## Attachments

| Filename | Type | Size |
| -------- | ---- | ---- |
| ...      | ...  | ...  |

## Custom Fields

| Field Name | Value |
| ---------- | ----- |
| ...        | ...   |
```

## Conditional Rules

- `## Comments` with no parent comments: `_None_`.
- `## Retrieval Warnings` with no warnings: `_None_`.
- `## Subtasks` with no verified subtasks: `_None_`.
- `## Subtasks` with unverified discovery: `_Unknown. Subtask discovery unavailable: <reason>_` plus a matching warning under `## Retrieval Warnings`.
- `## Linked Issues` with no verified links: `_None_`.
- `## Linked Issues` with unverified discovery: `_Unknown. Linked issue discovery unavailable: <reason>_` plus a matching warning under `## Retrieval Warnings`.
- A retrieved subtask or linked issue with no description: `_None_` under its `#### Description`.
- A retrieved subtask or linked issue with no comments: `_None_` under its `#### Comments`.
- `## Attachments` and `## Custom Fields`: render the table only when at least one row exists; otherwise write `_None_`.

### Missing Subtask Placeholder

```markdown
### <SUBTASK_KEY>: Not retrieved

- **Status:** Unknown
- **Assignee:** Unknown
- **Type:** Unknown
- **Retrieval Status:** Not retrieved
- **Reason:** <reason>

#### Description

_None_

#### Comments

_None_
```

### Missing Linked Issue Placeholder

```markdown
### <LINK_TYPE>: <ISSUE_KEY> - Not retrieved

- **Status:** Unknown
- **Assignee:** Unknown
- **Type:** Unknown
- **Retrieval Status:** Not retrieved
- **Reason:** <reason>

#### Description

_None_

#### Comments

_None_
```

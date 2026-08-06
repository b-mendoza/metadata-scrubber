# GitHub Snapshot Template

> Read this file only during document assembly, and only when the active platform is GitHub. Copy the fenced Markdown shape below into `docs/<ISSUE_SLUG>.md`. Prose outside the fence is retriever instruction, not output content.

## Contents

- Snapshot shape
- Conditional rules
- Missing child issue placeholder
- Missing linked issue placeholder

Every top-level heading in the fenced block is required. Repeated nested headings are shapes for items that exist or required `Not retrieved` placeholders. Write `_None_` for verified empty sections. Use the `_Unknown..._` markers from **Conditional Rules** when child-issue, linked-issue, or project discovery is unverified after the parent issue was retrieved. The rendered file is a Phase 1 workflow-state handoff for downstream orchestration phases and should remain unstaged.

```markdown
# <ISSUE_SLUG>: <Issue title>

> Retrieved on: <YYYY-MM-DD HH:MM UTC> Source: <ISSUE_URL or owner/repo#N> Repository: <owner>/<repo> | Issue: #<N>

## Metadata

| Field        | Value |
| ------------ | ----- |
| ISSUE_SLUG   | ...   |
| Repository   | ...   |
| Issue number | ...   |
| State        | ...   |
| Author       | ...   |
| Created      | ...   |
| Updated      | ...   |
| Closed       | ...   |
| URL          | ...   |

## Description

<full issue body after acceptance-criteria extraction, or _None_>

## Acceptance Criteria

<acceptance criteria, or _None_>

## Comments

### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

### Comment 2 - ...

## Retrieval Warnings

- <warning text>

## Child Issues

### <owner>/<repo>#<N>: <Title>

- **State:** ...
- **URL:** ...

#### Description

<body or _None_>

#### Comments

##### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

## Linked Issues

### <RELATION_OR_CONTEXT>: <owner>/<repo>#<N> - <Title>

- **State:** ...
- **URL:** ...

#### Description

<body or _None_>

#### Comments

##### Comment 1 - <Author> (<YYYY-MM-DD HH:MM UTC>)

<body>

## Labels

| Name | Description |
| ---- | ----------- |
| ...  | ...         |

## Assignees

| Login | Name or _None_ |
| ----- | -------------- |
| ...   | ...            |

## Milestone

<title and due date if any, or _None_>

## Projects

<table, bullet list of project membership, _Unknown. Project membership not determined: <reason>_, or _None_ when absence was verified>

## Attachments

_None_ or a short bullet list of explicitly linked upload or binary asset URLs found in issue or comment bodies.
```

## Conditional Rules

- `## Comments` with no parent comments: `_None_`.
- `## Retrieval Warnings` with no warnings: `_None_`.
- `## Child Issues` with no verified child issues: `_None_`.
- `## Child Issues` with unverified discovery: `_Unknown. Child issue discovery unavailable: <reason>_` plus a matching warning under `## Retrieval Warnings`.
- `## Linked Issues` with no verified links: `_None_`.
- `## Linked Issues` with unverified discovery: `_Unknown. Linked issue discovery unavailable: <reason>_` plus a matching warning under `## Retrieval Warnings`.
- `## Projects` when membership cannot be determined: `_Unknown. Project membership not determined: <reason>_` plus a matching warning under `## Retrieval Warnings`.
- A retrieved child or linked issue with no description: `_None_` under its `#### Description`.
- A retrieved child or linked issue with no comments: `_None_` under its `#### Comments`.
- `## Labels` and `## Assignees`: render the table only when at least one row exists; otherwise write `_None_`.

### Missing Child Issue Placeholder

```markdown
### <owner>/<repo>#<N>: Not retrieved

- **State:** Unknown
- **URL:** _None_
- **Retrieval Status:** Not retrieved
- **Reason:** <reason>

#### Description

_None_

#### Comments

_None_
```

### Missing Linked Issue Placeholder

```markdown
### <RELATION_OR_CONTEXT>: <owner>/<repo>#<N> - Not retrieved

- **State:** Unknown
- **URL:** _None_
- **Retrieval Status:** Not retrieved
- **Reason:** <reason>

#### Description

_None_

#### Comments

_None_
```

# External Sources

> Read this file only when you need general background, setup details, or current API/CLI syntax. Fetch one URL at a time, summarize the result, and discard the raw page. The bundled workflow contracts in this skill package remain authoritative for execution.

This file holds the shared loading rules, common concept references, and the wrapper format for web content. Per-platform URL groups (Jira / Atlassian setup, Jira REST API, GitHub CLI setup, `gh` syntax, Issues capabilities) live in the active playbook's `External-Source Routing` section, which links into the platform-specific sections below.

## Loading Rules

- Use bundled references (`./workflow-policy.md`, `./phases-1-4.md`, `./task-loop.md`, `./data-contracts.md`, `./error-handling.md`, `./downstream-skills.md`, and the active playbook) for anything workflow-specific.
- Fetch an external URL only when (a) the bundled contract does not answer the question, and (b) the answer would otherwise force a long inline instruction.
- Fetch one URL at a time. Summarize, then move on.
- If a web source conflicts with a bundled contract, follow the bundled contract and surface the discrepancy only when it affects the user's decision.
- Do not paraphrase whole pages back to the orchestrator; return only the single fact or step the current decision needs.

## When To Fetch

| Trigger | Pick a URL from |
| --- | --- |
| User asks why this workflow loads files just-in-time, or you must explain context engineering choices | [Concepts](#concepts) |
| `preflight-checker` reports a downstream skill `MISSING` / `UNKNOWN`, or the user needs skill installation / discovery help | [Agent skill runtime docs](#agent-skill-runtime-docs) |
| `preflight-checker` reports platform transport `MISSING` or the user needs setup help | Active playbook's `External-Source Routing` → the platform setup section below |
| You need the exact field name, endpoint, CLI flag, or query syntax for a platform read or write | Active playbook's `External-Source Routing` → the platform syntax section below |
| You need to know whether a GitHub-specific capability (sub-issues, dependencies, projects v2) is exposed for this repo | [GitHub Issues capabilities](#github-issues-capabilities) |
| You are authoring or revising a downstream skill or utility subagent and need design guidance | [Skill-authoring background](#skill-authoring-background-optional) |

## Concepts

| Need | Source |
| --- | --- |
| Progressive disclosure for skill content layering | https://skills.sh/flpbalada/fb-skills/progressive-disclosure |
| Original UX framing of progressive disclosure | https://www.nngroup.com/articles/progressive-disclosure/ |
| Context engineering, just-in-time retrieval, long-horizon agent loops | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Subagent context isolation and when to delegate | https://docs.claude.com/en/docs/claude-code/sub-agents |
| Skill format reference (frontmatter, structure, capabilities) | https://docs.claude.com/en/docs/claude-code/skills |

## Agent Skill Runtime Docs

| Need | Source |
| --- | --- |
| Agent Skills loading model and package anatomy | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| Skill authoring and packaging best practices | https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices |
| Claude Code skill installation and runtime behavior | https://code.claude.com/docs/en/skills |
| Cursor skill format and discovery paths | https://cursor.com/docs/skills |
| Runtime-agnostic Agent Skills context | https://agentskills.io |

## Jira / Atlassian Setup

| Need | Source |
| --- | --- |
| Atlassian Rovo MCP server overview and IDE setup | https://support.atlassian.com/rovo/docs/setting-up-ides/ |
| Rovo MCP troubleshooting and verification | https://support.atlassian.com/rovo/docs/troubleshooting-and-verifying-your-setup/ |
| MCP client security risks for Atlassian tools | https://www.atlassian.com/blog/artificial-intelligence/mcp-risk-awareness |
| Jira Cloud auth, scopes, and permissions overview | https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#authentication-and-authorization |

## Jira REST API Syntax

| Need | Source |
| --- | --- |
| Jira Cloud REST API v3 intro: pagination, status codes, expansions | https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ |
| Issue read/update/transition operations | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/ |
| Issue links and remote links | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/ |
| Comments on issues | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/ |
| JQL search and field reference | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ |

## GitHub CLI Setup

| Need | Source |
| --- | --- |
| Install `gh` on macOS, Linux, Windows | https://github.com/cli/cli#installation |
| `gh auth login` and authentication flow | https://cli.github.com/manual/gh_auth_login |
| `gh auth status` and token diagnostics | https://cli.github.com/manual/gh_auth_status |
| Required scopes for issue and project operations | https://docs.github.com/en/get-started/learning-about-github/access-permissions-on-github |
| Configuring `gh` for GitHub Enterprise hosts | https://cli.github.com/manual/gh_help_environment |

## GitHub CLI / API Syntax

| Need | Source |
| --- | --- |
| `gh` manual root (subcommand reference) | https://cli.github.com/manual/ |
| `gh issue view` fields and read flags | https://cli.github.com/manual/gh_issue_view |
| `gh issue create` flags and behavior | https://cli.github.com/manual/gh_issue_create |
| `gh issue edit` (labels, assignees, milestones, state) | https://cli.github.com/manual/gh_issue_edit |
| `gh issue comment` (write comments without leaving the CLI) | https://cli.github.com/manual/gh_issue_comment |
| `gh api` for REST and GraphQL fallback paths | https://cli.github.com/manual/gh_api |
| GitHub REST: Issues | https://docs.github.com/en/rest/issues/issues |
| GitHub REST: Issue comments | https://docs.github.com/en/rest/issues/comments |
| GitHub GraphQL schema explorer | https://docs.github.com/en/graphql/overview/explorer |

## GitHub Issues Capabilities

| Need | Source |
| --- | --- |
| Issues product overview | https://docs.github.com/en/issues |
| Sub-issues (native parent/child relationships) | https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues |
| Issue dependencies (blocking and blocked-by) | https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies |
| Task lists inside issue bodies | https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists |
| Linking pull requests to issues | https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue |

## Skill-Authoring Background (optional)

Use this section only when the user asks how this skill itself was written, or when extending this orchestrator with a new downstream skill. None of these URLs need to be fetched during normal workflow execution.

| Need | Source |
| --- | --- |
| Skill authoring overview and best-practice index | https://github.com/anthropics/skills |
| Sub-agent design guidance | https://docs.claude.com/en/docs/claude-code/sub-agents |

## How To Use Returned Web Content

When you fetch a source, condense it to one of these forms before continuing:

```text
EXTERNAL_SOURCE: OK
Source: <url>
Used for: <decision or setup question>
Relevant facts:
- <fact 1>
- <fact 2>
Workflow impact: <none | changed next step | user action needed>
```

If the source cannot be fetched, fall back to bundled contracts when possible and surface the missing external confirmation only when it blocks the user:

```text
EXTERNAL_SOURCE: UNAVAILABLE
Source: <url>
Used for: <decision or setup question>
Fallback: <bundled contract or local heuristic used instead>
Workflow impact: <none | needs user action>
```

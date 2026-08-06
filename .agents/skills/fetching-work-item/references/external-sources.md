# External Sources

> Read this file only to choose public URLs for just-in-time retrieval. Static background and current API details live here as links instead of in always-loaded prompts. The skill is usable without web access; bundled routing, contracts, capture rules, and templates cover normal execution. The active playbook's `External-Source Routing` section names which group below to use for the detected platform.

## Fetch Policy

1. Apply the bundled playbook and shared retrieval playbook first. Fetch a URL only when exact API/CLI syntax, auth behavior, pagination, rate limiting, rich-text or sub-issue/project behavior, or progressive-disclosure rationale could change the next action.
2. Fetch only URLs listed in the **Source Routing** tables. Treat links inside a fetched page as out of scope unless their destination is also listed.
3. Use at most two fetched pages per retrieval pass. Summarize the relevant detail in one or two sentences before applying it.
4. If fetching fails, proceed from bundled references when safe and record the uncertainty under `Warnings` if it affects completeness.
5. Keep Phase 1 handoff rules local: external URLs may clarify platform mechanics, but they do not replace `fetch-contract.md` or the snapshot template.

## Shared Concepts and Skill Docs

| Reference key | URL | Use when |
| --- | --- | --- |
| `agent-skills-overview` | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | The skill loading model or staged file access needs source-backed context |
| `agent-skills-best-practices` | https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices | Maintaining this package's concise SKILL.md, one-hop references, or examples |
| `context-engineering` | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | Context-window and just-in-time retrieval rationale is needed |
| `progressive-disclosure-skill` | https://skills.sh/flpbalada/fb-skills/progressive-disclosure | Maintaining or explaining staged loading in this skill |
| `progressive-disclosure-ux` | https://www.nngroup.com/articles/progressive-disclosure/ | A short public explanation of revealing only needed information would help |

## Jira Source Routing

| Reference key | URL | Use when |
| --- | --- | --- |
| `jira-rest-intro` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ | Authentication, status codes, pagination, expansions, or timestamp behavior is unclear |
| `jira-get-issue` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get | Parent or related issue field retrieval syntax is unclear |
| `jira-bulk-fetch` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-bulkfetch-post | Multiple related issues should be fetched efficiently by key or ID |
| `jira-comments` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/ | Comment pagination or comment payload shape is unclear |
| `jira-issue-search` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ | JQL search is needed to verify relationships or hydrate related issues |
| `jira-issue-links` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/ | Linked issue payloads or link-type semantics are unclear |
| `jira-attachments` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/ | Attachment metadata fields or binary-download boundaries are unclear |
| `jira-fields` | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/ | Custom field names or field metadata are unclear |
| `jira-adf` | https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/ | Jira rich-text description or textarea field content needs normalization |
| `jira-rate-limits` | https://developer.atlassian.com/cloud/jira/platform/rate-limiting/ | Retry or rate-limit classification is unclear |

## GitHub Source Routing

| Reference key | URL | Use when |
| --- | --- | --- |
| `gh-issue-view` | https://cli.github.com/manual/gh_issue_view | Parent issue command flags or JSON fields are unclear |
| `gh-api` | https://cli.github.com/manual/gh_api | REST, GraphQL, pagination, headers, host, or `jq` behavior through `gh api` is unclear |
| `gh-auth-status` | https://cli.github.com/manual/gh_auth_status | Non-interactive authentication checks are unclear |
| `github-rest-issues` | https://docs.github.com/en/rest/issues/issues#get-an-issue | REST issue fields, status codes, or media types are unclear |
| `github-rest-comments` | https://docs.github.com/en/rest/issues/comments#list-issue-comments | Issue comment pagination or payload shape is unclear |
| `github-rest-timeline` | https://docs.github.com/en/rest/issues/timeline#list-timeline-events-for-an-issue | Linked issue discovery through timeline events is unclear |
| `github-rest-sub-issues` | https://docs.github.com/en/rest/issues/sub-issues#list-sub-issues | Child issue discovery or sub-issue endpoint support is unclear |
| `github-rest-pagination` | https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api | REST pagination behavior is unclear |
| `github-rest-rate-limits` | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api | Retry or rate-limit classification is unclear |
| `github-graphql` | https://docs.github.com/en/graphql | Project membership or fields require GraphQL syntax |
| `github-projects` | https://docs.github.com/en/issues/planning-and-tracking-with-projects | Project membership concepts or limitations are unclear |

## When Network Is Unavailable

Continue with bundled references. Do not claim version-specific platform API or CLI facts that were not verified. Use `FETCH: PARTIAL` when unavailable source material prevents verifying related-item discovery after the parent work item was retrieved.

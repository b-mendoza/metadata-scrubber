# External Sources

Read this file when an inline operational contract is not enough and you want source-backed background, current platform syntax, or a method explanation. The active playbook's `External-Source Routing` section names which platform hierarchy key to use.

> **Reminder:** This skill is designed to run offline. Bundled references are the execution contract. External URLs are optional just-in-time enrichment; proceed with the local references when network access is unavailable and avoid claiming version-specific platform behavior.

## Authority Model

Bundled references are the binding workflow contract. External sources replace long static explanations and provide current syntax or rationale on demand; they do not override user instructions, host system rules, or local output contracts.

## Fetch Policy

1. Apply the relevant bundled reference first. Fetch a URL only when the decision needs background concept material, current command syntax, or source rationale.
2. Fetch only URLs listed below. Treat links inside a fetched page as out of scope unless that destination is also listed here.
3. Fetch one source first; fetch a second only when the first does not answer the question. Limit yourself to two fetched pages per stage.
4. Summarize fetched content into the compact form below, then discard page details from working context unless they directly affect the decision.

## Shared Source Routing

| Reference key | Use when | URL |
| --- | --- | --- |
| `progressive-disclosure-skill` | Maintaining or explaining the staged loading model | https://skills.sh/flpbalada/fb-skills/progressive-disclosure |
| `progressive-disclosure-ux` | Short public explanation of revealing only phase-relevant information | https://www.nngroup.com/articles/progressive-disclosure/ |
| `agent-skills-overview` | Agent Skills loading model, anatomy, descriptions | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| `agent-skills-best-practices` | Skill authoring guidance, file organization, validation | https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices |
| `claude-code-subagents` | Subagent frontmatter, tool controls, delegation patterns | https://code.claude.com/docs/en/sub-agents |
| `git-check-ref-format` | Branch-name validity rules: forbidden characters, sequences, and edge cases | https://git-scm.com/docs/git-check-ref-format |
| `feature-branch-workflow` | Background on the `feature/<slug>` convention | https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow |
| `conventional-branches` | Optional branch-prefix conventions when a team prefix is not provided | https://conventional-branches.com |
| `topological-sort` | Background for ordering tasks under hard dependencies | https://en.wikipedia.org/wiki/Topological_sorting |
| `requirements-traceability` | Calibrating the `Traces to` requirement and acceptance-criteria coverage | https://en.wikipedia.org/wiki/Requirements_traceability |
| `five-whys` | Background for `## Problem Framing` and the underlying-need subsection | https://en.wikipedia.org/wiki/Five_whys |
| `rice-scoring` | Background for the Risk / Complexity / Value-unlock / Dependency scoring rubric | https://www.productplan.com/glossary/rice-scoring-model/ |
| `yagni` | Calibrating "scope creep" or speculative tasks during planning | https://martinfowler.com/bliki/Yagni.html |
| `definition-of-done` | Calibrating per-task `Definition of done` items so they are concrete and verifiable | https://www.scrum.org/resources/what-definition-done |
| `invest-criteria` | Sanity-checking task quality with INVEST | https://en.wikipedia.org/wiki/INVEST_(mnemonic) |

## Jira Source Routing

| Reference key | Use when | URL |
| --- | --- | --- |
| `jira-subtasks` | Jira subtask hierarchy: parent ticket vs subtask, conversion, restrictions | https://support.atlassian.com/jira-cloud-administration/docs/configure-sub-tasks/ |

## GitHub Source Routing

| Reference key | Use when | URL |
| --- | --- | --- |
| `github-sub-issues` | GitHub issue hierarchy: parent issue vs sub-issue and limits | https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues |
| `github-issue-types` | GitHub issue types and labels behavior in modern issues | https://docs.github.com/en/issues/tracking-your-work-with-issues/configuring-issues/managing-issue-types-in-an-organization |

## How To Use Returned Web Content

Summarize a fetched source into one of these forms before applying it:

```text
EXTERNAL_SOURCE: OK
Source: <url>
Used for: <decision or finding>
Relevant facts:
- <fact 1>
- <fact 2>
Workflow impact: <none | adjusted finding | added confidence note>
```

Do not embed long quotes from the page in any planning artifact. Cite the source with a one-line link only when it directly affects a finding.

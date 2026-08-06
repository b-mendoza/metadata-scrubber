# External Sources

> Read this file only to choose a public URL for just-in-time methodology retrieval. The active playbook owns platform-group routing. Fetch only when a source can change the current brief, implementation-plan, test, or refactoring decision.

The skill runs offline because routing, contracts, templates, and platform semantics are bundled locally. Public pages provide optional source-backed methodology, never tracker transport or authority over local contracts.

## Fetch Policy

- Prefer zero external fetches on routine runs.
- Fetch only URLs listed below and only when the result can change the current artifact decision.
- Prefer official or primary sources for exact definitions.
- Use conceptual articles to justify a narrow decision, not to broaden scope.
- Use at most two pages per stage.
- Summarize the relevant point in one or two sentences before applying it.
- Record exact URLs in `References fetched`; do not paste long excerpts into artifacts.
- If fetching fails, continue from bundled references when safe and record the unreachable URL in `References fetched`, `Notes`, or `Blockers` as the subagent summary shape permits.
- Do not claim source-backed methodology that was not fetched.

## GitHub Task Readiness and Acceptance

| Reference key | URL | Use when |
| --- | --- | --- |
| `github-issues` | https://docs.github.com/en/issues/tracking-your-work-with-issues/about-issues | Issue or GitHub task-issue framing needs current public guidance |
| `github-issue-forms` | https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates | Acceptance-criteria or task-template shape needs source backing |

## Jira Task Readiness and Acceptance

| Reference key | URL | Use when |
| --- | --- | --- |
| `jira-user-stories` | https://www.atlassian.com/agile/project-management/user-stories | Story shape, acceptance criteria, or Jira-adjacent readiness needs guidance |

## Shared Task Readiness and Acceptance

| Reference key | URL | Use when |
| --- | --- | --- |
| `definition-of-ready` | https://www.atlassian.com/agile/scrum/definition-of-ready | Task-readiness criteria are unclear or contested |
| `definition-of-done` | https://www.atlassian.com/agile/project-management/definition-of-done | Definition-of-done shape is unclear or under debate |

## Planning and User Impact

| Reference key | URL | Use when |
| --- | --- | --- |
| `yagni` | https://martinfowler.com/bliki/Yagni.html | A proposed abstraction or extension serves only future flexibility |
| `wrong-abstraction` | https://www.sandimetz.com/blog/2016/1/20/the-wrong-abstraction | Shared abstraction may be riskier than duplication for this task |

## Testing Strategy

| Reference key | URL | Use when |
| --- | --- | --- |
| `bdd-overview` | https://cucumber.io/docs/bdd/ | Behavior-driven test grouping or terminology is unclear |
| `given-when-then` | https://martinfowler.com/bliki/GivenWhenThen.html | A test group needs Given/When/Then framing |
| `test-pyramid` | https://martinfowler.com/bliki/TestPyramid.html | Testing-level tradeoffs are unclear |
| `practical-test-pyramid` | https://martinfowler.com/articles/practical-test-pyramid.html | Concrete pyramid examples or anti-patterns are needed |
| `test-double` | https://martinfowler.com/bliki/TestDouble.html | Stub, mock, fake, or spy choice is unclear |

## Refactoring Scope and Moves

| Reference key | URL | Use when |
| --- | --- | --- |
| `definition-of-refactoring` | https://martinfowler.com/bliki/DefinitionOfRefactoring.html | A recommendation risks changing behavior rather than refactoring |
| `refactoring-catalog` | https://refactoring.com/catalog/ | A recommendation needs a named, established refactoring move |

## Network Unavailable

Continue with bundled references. Prefer the smallest safe local plan and surface uncertainty in the subagent's `Blockers` or `Notes` field. Network failure never authorizes tracker calls, broader repository inspection, or planning another task.

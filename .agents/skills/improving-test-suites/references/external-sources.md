# External Sources

> Read this file only when a concrete keep, delete, rewrite, consolidate, add,
> or validation decision needs source-backed support that local code, public
> contracts, and bundled heuristics cannot answer alone.

This file replaces long inline testing-philosophy prose. Public sources cover
stable knowledge such as behavior-vs-implementation testing, the test pyramid,
mock semantics, DAMP vs. DRY, framework syntax (pytest, Testing Library), and
API/security review categories, so the always-loaded prompt stays small.
Local tests, production code, public contracts, and observed failures take
priority over generic external advice.

## Loading Rules

- Use local repository evidence first.
- Fetch one source, the closest match for the current decision; fetch a second
  only if the first does not answer the question.
- Apply the source to the specific finding, then return to local evidence.
- If a public source conflicts with a bundled contract or visible project
  convention, follow the local source and note the discrepancy only when it
  affects the user.
- Record every fetched URL in the subagent report.

## Source Routing

| Reference key | URL | Use when |
| ------------- | --- | -------- |
| `behavior-vs-implementation` | https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html | Distinguish behavior tests from implementation-detail tests when proposing keep, rewrite, or delete decisions |
| `implementation-details-react` | https://kentcdodds.com/blog/testing-implementation-details | Component, hook, or UI-style tests assert internal structure instead of user-observable outcomes |
| `prefer-public-apis` | https://testing.googleblog.com/2015/01/testing-on-toilet-prefer-testing-public.html | Tests reach into private classes or modules instead of exercising the public surface |
| `how-to-know-what-to-test` | https://kentcdodds.com/blog/how-to-know-what-to-test | Decide which behaviors deserve tests and which do not warrant the maintenance cost |
| `test-pyramid` | https://martinfowler.com/articles/practical-test-pyramid.html | Balance unit, integration, and end-to-end coverage when proposing harness shape |
| `e2e-skepticism` | https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html | Push back on excessive end-to-end coverage in changed areas |
| `mocks-arent-stubs` | https://martinfowler.com/articles/mocksArentStubs.html | Reason about mocks, stubs, classical vs. mockist style, and collaboration tests |
| `damp-not-dry` | https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html | Tests are over-abstracted into shared helpers and the rule under test is hidden |
| `swe-google-unit-testing` | https://abseil.io/resources/swe-book/html/ch12.html | Source-backed unit-testing principles on test value, scope, and brittleness |
| `xunit-test-patterns` | http://xunitpatterns.com/ | Catalogue of test smells, fixture strategies, and stub/mock patterns |
| `pytest-good-practices` | https://docs.pytest.org/en/stable/explanation/goodpractices.html | Structure pytest suites: layout, conftest scope, discovery |
| `pytest-parametrize` | https://docs.pytest.org/en/stable/example/parametrize.html | Reduce duplicated cases by parametrizing one rule across inputs |
| `pytest-fixtures` | https://docs.pytest.org/en/stable/explanation/fixtures.html | Fixture scope, composition, and override are unclear |
| `testing-library-principles` | https://testing-library.com/docs/guiding-principles | Align UI tests with user-observable behavior over rendered implementation details |
| `vitest-docs` | https://vitest.dev/guide/ | Current Vitest API, mocking, and configuration syntax |
| `jest-docs` | https://jestjs.io/docs/getting-started | Current Jest API, matchers, mocking, and configuration |
| `playwright-best-practices` | https://playwright.dev/docs/best-practices | E2E test design, locator selection, and flakiness reduction |
| `cypress-best-practices` | https://docs.cypress.io/app/core-concepts/best-practices | Cypress test design and selector strategy |
| `owasp-api-top-10` | https://owasp.org/API-Security/editions/2023/en/0x11-t10/ | Evaluate API security risk categories when reviewing API/auth/input tests |
| `owasp-api-testing` | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/00-API_Testing_Overview | Concrete API test ideas for auth, input validation, and unsafe inputs |
| `owasp-cheatsheets` | https://cheatsheetseries.owasp.org/ | Concrete control or hardening guidance for a named security risk |
| `owasp-top-ten` | https://owasp.org/www-project-top-ten/ | Categorize a security risk in user-facing terms |
| `code-smell` | https://martinfowler.com/bliki/CodeSmell.html | Source-backed definition of a smell in a test or fixture being called out |
| `refactoring-smells` | https://refactoring.guru/refactoring/smells | Catalog of smells (duplication, large class, shotgun surgery) when explaining a rewrite |
| `progressive-disclosure-skill` | https://skills.sh/flpbalada/fb-skills/progressive-disclosure | Maintaining or explaining the staged loading model used by this skill |
| `progressive-disclosure-ux` | https://www.nngroup.com/articles/progressive-disclosure/ | Background on showing only phase-relevant information |

When the needed source is not listed and the user supplied an official
documentation URL, fetch that instead. Do not invent URLs.

## Freshness Policy

- Stable testing philosophy sources can be treated as background guidance
  after one fetch.
- Current framework behavior, SDK APIs, CLI syntax, and security advisories
  need current official documentation. Use the official URLs in the routing
  table or a URL supplied by the user.
- If a freshness-sensitive source is unavailable, return
  `NEEDS_CLARIFICATION` or record the freshness gap as a remaining risk
  instead of guessing version-specific behavior.

## How To Use Returned Web Content

When a fetched source materially influences a decision, summarize it into the
report instead of pasting long quotes:

```text
EXTERNAL_SOURCE: OK
Source: <url>
Used for: <decision or finding>
Relevant facts:
- <fact 1>
- <fact 2>
Workflow impact: none | adjusted finding | added confidence note
```

Cite the source briefly next to the finding it supports (one inline link is
enough). Keep raw page content out of the orchestrator and out of long-form
reports.

## When Network Access Is Unavailable

Continue from local code and bundled heuristics. State that external material
was not fetched, avoid claiming version-specific facts, and add a short
confidence note only when missing source material would have changed the
recommendation. Use the existing `Remaining risks` slot in the final
handoff template; do not invent a separate uncertainty section.

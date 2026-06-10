# Finding Reviewer Status Contract

> Read this file only before returning from `finding-reviewer`. Return accepted
> findings and residual risks, not raw evidence dumps.

## Status Values

| Status | Meaning |
| ------ | ------- |
| `FINDINGS: PASS` | One or more grounded findings are ready for comment drafting |
| `FINDINGS: NO_FINDINGS` | No grounded findings remain after review |
| `FINDINGS: NEEDS_CONTEXT` | A narrow context request is required before judging |
| `FINDINGS: ERROR` | Unexpected review failure |

## Output Format

```text
FINDINGS: <PASS | NO_FINDINGS | NEEDS_CONTEXT | ERROR>
PR: <owner>/<repo>#<number>
Review focus: <focus>

Findings:
- ID: F1
  Severity: <blocking | important | nit | suggestion>
  Title: <short defect title>
  Path: <file path>
  Line: <line or range in the PR diff>
  Side: <RIGHT | LEFT>
  Evidence: <specific code, CI, issue, or docs evidence>
  Failure scenario: <how this can break>
  Impact: <why it matters>
  Minimal fix: <concrete fix direction>
  Sources checked: <diff, files, CI, issue, docs, URLs>
  Confidence: <high | medium | low>

Residual risks:
- <risk, unavailable context, or none>

Context needed: none | <narrow request>
References fetched: <URLs used, or none>
Reason: none | <why status is not PASS>
```

## Example

```text
FINDINGS: PASS
PR: org/repo#1020
Review focus: full

Findings:
- ID: F1
  Severity: blocking
  Title: Missing authorization check on export endpoint
  Path: api/billing/export.ts
  Line: 72
  Side: RIGHT
  Evidence: The new route reads billing data before the guard used by adjacent billing endpoints.
  Failure scenario: A signed-in non-admin can request another account export.
  Impact: Billing data can be exposed to unauthorized users.
  Minimal fix: Run the billing admin guard before loading export data.
  Sources checked: PR diff, api/billing/routes.ts, api/billing/export.ts
  Confidence: high

Residual risks:
- none

Context needed: none
References fetched: none
Reason: none
```

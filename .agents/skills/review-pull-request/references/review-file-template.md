# Review File Template

> Read this file only from `review-writer` while assembling `OUTPUT_FILE`.
> Preserve verified findings, comments, metadata, and suggestion blocks exactly.

The review file must stand alone without chat context. It should be findings
first, concise, and explicit about residual risks and posting status.

## With Findings

````markdown
# PR <number> Review

PR: <PR_URL>

## Findings

### 1. [<severity>] <finding title>

- Finding ID: `<id>`
- File/line: `<path>:<line-or-range>`
- Evidence: <specific evidence>
- Impact: <why this matters>
- Fix: <minimal fix>
- Line metadata: `path=<path>`, `line=<line>`, `side=<RIGHT|LEFT>`, `start_line=<line-or-none>`, `start_side=<side-or-none>`
- Sources checked: <diff, files, CI, issue, docs, URLs>

Draft PR comment:

<comment body>

Suggestion:

```suggestion
<suggested patch, only when verified safe>
```

Or: `Suggestion: none`

## Review Decision

<comment | request changes | approve> because <short rationale>.

## Verification Notes

- Residual risks: <risks or none>
- Posting status: <not posted | posted | cancelled>
````

## No Findings

Use `approve` when residual risks do not block approval; otherwise use `comment`
so the review can report residual risks without approving the pull request.

```markdown
# PR <number> Review

PR: <PR_URL>

## Findings

No findings.

## Review Decision

<approve | comment> because <short rationale>.

## Residual Risks

- <risk, testing gap, unavailable context, or none>

## Verification Notes

- Sources checked: <diff, files, CI, issue, docs, URLs>
- Posting status: <not posted | posted | cancelled>
```

## Required Post-Write Check

After writing the file, confirm these sections exist:

- `## Findings`
- `## Review Decision`
- `## Verification Notes`
- `## Residual Risks` when there are no findings

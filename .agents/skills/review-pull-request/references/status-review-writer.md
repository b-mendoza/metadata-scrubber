# Review Writer Status Contract

> Read this file only before returning from `review-writer`. The written file is
> the durable artifact; this status block is a compact handoff.

## Status Values

| Status | Meaning |
| ------ | ------- |
| `WRITE: PASS` | Review file was written to the exact workspace-relative Markdown path and required sections were verified |
| `WRITE: ERROR` | Writing failed, the output path was invalid, or required sections are missing |

## Output Format

```text
WRITE: <PASS | ERROR>
File: <safe workspace-relative Markdown OUTPUT_FILE>
Findings count: <number>
Review decision: <comment | request changes | approve>
Posting status: <not posted | posted | cancelled>
Reason: none | <why status is ERROR>
```

## Example

```text
WRITE: PASS
File: pr-1020-review.md
Findings count: 2
Review decision: request changes
Posting status: not posted
Reason: none
```

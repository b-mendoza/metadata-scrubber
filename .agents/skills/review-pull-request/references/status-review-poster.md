# Review Poster Status Contract

> Read this file only before returning from `review-poster`. Report the side
> effect and read-back verification without changing verified comment content.

## Status Values

| Status | Meaning |
| ------ | ------- |
| `POST: PASS` | Approved review content was posted and read back successfully |
| `POST: PREVIEW_REQUIRED` | `HUMAN_GATE_FINAL_PREVIEW_APPROVAL` did not set `PREVIEW_APPROVED=true` for the exact verified preview |
| `POST: AUTH` | Authentication or permission failed |
| `POST: METADATA_INVALID` | Required review decision, comment body, or line metadata was missing or invalid |
| `POST: ERROR` | Unexpected posting or read-back failure |

## Output Format

```text
POST: <PASS | PREVIEW_REQUIRED | AUTH | METADATA_INVALID | ERROR>
PR: <owner>/<repo>#<number>
Preview approved: <true | false>
Posted comments: <number>
Review decision posted: <comment | request changes | approve | none>
Read-back verified: <yes | no>
Skipped comments:
- <finding id and reason, or none>
References fetched: <URLs used, or none>
Reason: none | <why status is not PASS>
Next step: none | <smallest recovery action>
```

## Example

```text
POST: PREVIEW_REQUIRED
PR: org/repo#1020
Preview approved: false
Posted comments: 0
Review decision posted: none
Read-back verified: no
Skipped comments:
- all comments: preview approval was not true
References fetched: none
Reason: Posting requires explicit final approval.
Next step: Ask the user to approve the exact comment preview.
```

# Comment Drafter Status Contract

> Read this file only before returning from `comment-drafter`. Preserve finding
> IDs exactly and include enough line metadata for verification.

## Status Values

| Status | Meaning |
| ------ | ------- |
| `COMMENTS: PASS` | Comments and review decision recommendation are ready for verification |
| `COMMENTS: NEEDS_METADATA` | A target line or side cannot be resolved without more metadata |
| `COMMENTS: ERROR` | Unexpected drafting failure |

## Output Format

````text
COMMENTS: <PASS | NEEDS_METADATA | ERROR>
PR: <owner>/<repo>#<number>
Review decision recommendation: <comment | request changes | approve>

Comments:
- Finding ID: F1
  Path: <file path>
  Line: <line>
  Side: <RIGHT | LEFT>
  Start line: <line or none>
  Start side: <RIGHT | LEFT | none>
  Comment type: <line | multi-line | file>
  Suggestion included: <yes | no>
  Body:
    <comment body>
  Suggestion:
    ```suggestion
    <patch text, or none>
    ```

Metadata gaps:
- <missing metadata or none>
References fetched: <URLs used, or none>
Reason: none | <why status is not PASS>
````

## Example

```text
COMMENTS: PASS
PR: org/repo#1020
Review decision recommendation: request changes

Comments:
- Finding ID: F1
  Path: api/billing/export.ts
  Line: 72
  Side: RIGHT
  Start line: none
  Start side: none
  Comment type: line
  Suggestion included: no
  Body:
    This route loads billing export data before checking that the caller is a billing admin. Adjacent billing routes run the guard first, so this can expose account data to a signed-in user who should not have access. Can we move the guard before the export lookup?
  Suggestion:
    none

Metadata gaps:
- none
References fetched: none
Reason: none
```

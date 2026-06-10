# Output Contract - Review Metadata Suggester

> Load at return time. The orchestrator uses reviewer and label fields in the
> preview.

## Template

```text
REVIEW_METADATA: PASS | NEEDS_REVIEWER | INVALID_LABELS | AUTH | ERROR
Remote name: <remote_name>
Reviewers: <reviewer list or none>
Reviewer source: user | CODEOWNERS | none
Labels: <label list or none>
Label source: platform-list | user-override | skipped | none
CODEOWNERS source: .github/CODEOWNERS | CODEOWNERS | none

Reason: none | <why status is not PASS>
Decision needed: none | <smallest user decision or recovery action>
```

## Codes

- `PASS`: at least one valid reviewer is resolved and labels are valid.
- `NEEDS_REVIEWER`: no user or platform-valid CODEOWNERS reviewer is available.
- `INVALID_LABELS`: an override label is absent from platform labels.
- `AUTH`: platform tooling or credentials prevent lookup.
- `ERROR`: unexpected metadata failure.

`Reviewer source: CODEOWNERS` means a matched owner is requestable for the
active repository and target branch. If matched owners are missing, invalid, or
not eligible for review requests on the active platform, return
`NEEDS_REVIEWER`.

## Orchestrator Routing

On `NEEDS_REVIEWER`, the orchestrator asks one focused reviewer question and
redispatches only `review-metadata-suggester` with that answer. On
`INVALID_LABELS`, it asks for valid existing labels or removal, then redispatches
only this subagent. `AUTH` maps to `AUTH`; `ERROR` maps to `BLOCKED`.

## Example

<example>
REVIEW_METADATA: INVALID_LABELS
Remote name: origin
Reviewers: alice
Reviewer source: user
Labels: none
Label source: user-override
CODEOWNERS source: none

Reason: Label `doc` does not exist on the repository.
Decision needed: Ask the user to choose `documentation` or remove labels.
</example>

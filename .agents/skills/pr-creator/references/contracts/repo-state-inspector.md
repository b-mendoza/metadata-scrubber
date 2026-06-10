# Output Contract - Repo State Inspector

> Load at return time. The orchestrator uses only these summary fields.

## Template

```text
REPO_STATE: PASS | BLOCKED | ERROR
Remote name: <remote name or none>
Remote: <remote url or none>
Platform: github | github-enterprise | gitlab | bitbucket | unknown
Current branch: <branch or none>
Target branch: <target branch or missing>
PR state: draft | ready | invalid
Uncommitted work: none | <count and concise categories>
Platform adapter needed: yes | no

Reason: none | <why status is not PASS>
Decision needed: none | <smallest user decision or orchestrator action>
```

## Codes

- `PASS`: routing data is available.
- `BLOCKED`: not a git repo, detached HEAD, invalid `PR_STATE`, or no safe
  branch name.
- `ERROR`: unexpected inspection failure.

## Orchestrator Routing

On `PASS`, the orchestrator records the returned `Remote name` and any
uncommitted-work boundary, then uses the returned `Platform` and
`Platform adapter needed` fields to decide whether to load
`../platform-adaptation.md` before preflight. `BLOCKED` and `ERROR` map to the
`BLOCKED` failure envelope.

## Example

<example>
REPO_STATE: PASS
Remote name: origin
Remote: git@github.com:acme/app.git
Platform: github
Current branch: docs/pr-creator-skill
Target branch: main
PR state: draft
Uncommitted work: none
Platform adapter needed: no

Reason: none
Decision needed: none
</example>

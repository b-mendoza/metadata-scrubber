# Propose an issue, do not file one

Scope: every multi-step or non-trivial task and every observed defect outside the current work.

Why: an issue adds work and notifications to a shared tracker. The user decides whether to create it.

## Do's
### Propose a GitHub issue for substantial work and report unrelated defects with evidence

Propose an issue for each multi-step or non-trivial task. State the goal and scope. Report unrelated defects with verified file locations and evidence instead of fixing them. Wait for an explicit request before creating an issue.

```text
Hypothetical issue proposal: split a large upload change into independently testable units.
Scope: admission and its tests. Leave unrelated cleanup out.
Done when: each admission decision has a verified result.
No issue has been created.
```

## Don'ts
### Do not file an issue without approval or present a hypothetical defect as observed

```sh
# No issue was requested. This title is hypothetical, not a verified defect.
gh issue create --title "Upload admission needs investigation" --body "Investigate admission."
```

# Run documented checks and report their limits

Scope: verification and review evidence, including substantive changes, reported checks, and AI review.

Why: checks provide evidence, not a guarantee of correctness. A report must match the current change and actual output.

## Do's
### Run service commands and report results, warnings, and gaps

Run the affected service's lint check after a substantive change. Run its test suite before a commit. Find the commands in that service's authoritative manifests or task declarations. If a documented command is missing or broken, report it. Do not guess or improvise a replacement.

Report a check as passing only after running it against the current change and seeing it pass. Include failures and warnings. State what the checks cannot detect, what you could not exercise, and what has no automated check. These are known gaps, not permission to skip verification. A passing result does not supply missing coverage.

Escalate doubt about correctness. Do not declare success while that doubt remains.

Treat AI review as advisory, never as the only merge approval. Review concerns that deterministic checks cannot enforce. Never waive, override, or discount a failing deterministic check.

```text
Hypothetical verification report:
Command and directory: pnpm run lint, from frontend/
Observed result: exit 1; report the actual errors and warnings.
Not exercised: production deployment. Passing local checks would not cover that gap.
```

## Don'ts
### Do not claim an unrun check or hide a failure behind a substitute

Do not duplicate machine-owned findings for complexity, switches, class syntax, lookup-map structure, formatting, or other deterministic rules.

```text
The documented check was broken, so I guessed a replacement and reported lint as passing.
The tests passed before the final edit, so every changed path must now be correct.
```

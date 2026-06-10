# Dispatch Example

> Read this file only when an example would clarify dispatch order, expected
> subagent summaries, warning handling, targeted reruns, or the final response
> shape returned to the user.

## Example

Input:

- `TARGET_FILE=docs/auth-review-handoff.md`
- `SUBJECT=Authentication review`
- `TRACKING_FILES=docs/auth-review-notes.md`

Derived working artifacts (per `./data-contracts.md`):

- `docs/auth-review-handoff.context.json`
- `docs/auth-review-handoff.insights.json`
- `docs/auth-review-handoff.claims.json`

Dispatch round trip:

1. Validate readable inputs, writable target, and sibling artifact locations.
2. Record external-source status:

   ```text
   EXTERNAL: SKIPPED
   Reason: Bundled contracts were sufficient.
   ```

3. Dispatch `context-extractor`.
4. Subagent returns:

   ```text
   CONTEXT: PASS
   File: docs/auth-review-handoff.context.json
   Q&A exchanges: 4
   ```

5. Dispatch `insight-documenter`.
6. Subagent returns:

   ```text
   INSIGHTS: PASS
   File: docs/auth-review-handoff.insights.json
   Insights: 6
   ```

7. Dispatch `claim-validator`.
8. Subagent returns:

   ```text
   CLAIMS: WARN
   File: docs/auth-review-handoff.claims.json
   Claims checked: 9
   Unverified: 2
   Reason: Two claims could not be fully verified.
   ```

9. Capture the claims warning and dispatch `document-assembler`.
10. Subagent returns:

   ```text
   HANDOFF: PASS
   File: docs/auth-review-handoff.md
   Open questions: 2
   ```

11. Dispatch `handoff-reviewer`.
12. Subagent returns:

   ```text
   REVIEW: PASS
   File: docs/auth-review-handoff.md
   Failed gates: 0
   Rerun: none
   Open questions: 2
   Warnings: 1
   ```

13. Report to the user:

   ```text
   Handoff document written to docs/auth-review-handoff.md.
   Artifacts: docs/auth-review-handoff.context.json,
   docs/auth-review-handoff.insights.json,
   docs/auth-review-handoff.claims.json.
   External: SKIPPED. Stage verdicts: CONTEXT PASS, INSIGHTS PASS,
   CLAIMS WARN, HANDOFF PASS, REVIEW PASS. Two open questions and two
   unverified claims remain.
   ```

The orchestrator keeps only those summaries, warnings, counts, and file paths.

## Skipping Stage 4

When `TRACKING_FILES` is not provided, replace the claim-validation dispatch
with:

```text
CLAIMS: SKIPPED
Reason: No tracking files supplied; next agent will verify claims independently.
```

`document-assembler` then produces Section 4 with the explicit "no tracking
files" directive instead of a validation checklist.

## Targeted Repair Example

If `handoff-reviewer` returns:

```text
REVIEW: FAIL
File: docs/auth-review-handoff.md
Failed gates: 2
Rerun: insight-documenter, document-assembler
Open questions: 2
Warnings: 0
Reason: Some insights lack concrete evidence and Section 5 has generic next steps.
```

The orchestrator increments the repair counter, normalizes the rerun targets,
reruns `insight-documenter`, then reruns downstream `document-assembler`, then
reruns `handoff-reviewer`. If the reviewer still fails after three repair
cycles, the orchestrator reports `Blocked: repair limit exhausted`.

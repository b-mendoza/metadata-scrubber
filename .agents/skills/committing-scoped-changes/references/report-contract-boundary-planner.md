# Boundary Planner Report Contract

Return this exact structure. The plan accounts for every scoped change in a
group include list or the omissions list.

```markdown
COMMIT_PLAN: PASS | NEEDS_DECISION | NO_COMMIT_WORTHY_CHANGES | BLOCKED | ERROR

Plan digest: <stable group ids + messages>

Groups:
- ID: <group-id>
  Intent: <one reviewer-facing reason>
  Message: <candidate commit message>
  Include: <paths/hunks; name renames old -> new and submodule pointers>
  Exclude: <paths/hunks protected from this group>
  Verification: <read-only command or not-run>
  Verification reason: <why this is valid, or why not-run>
  Required gates: <none or G_SCOPE_EXPANSION exact paths | G_UNVERIFIED_COMMIT>
  Risk: <low|medium|high + reason>

Omissions:
- <path/change> annotation=<generated|formatting-only|out-of-band|other> reason=<why omitted>

Scope expansion candidates: <none or exact paths + reason + safer alternative>
User decisions applied: <none or compact list>
Next reference needs: <none or consumer:key list>
References fetched: <none or URL -> one-line conclusion>
Reason: <required for non-PASS>
Decision needed: <required for NEEDS_DECISION>
```

Contract rules:

- Every tracked modification, deletion, and untracked file under `CHANGE_PATHS`
  appears in exactly one `Include` or `Omissions` entry.
- A non-empty `Omissions` list always triggers orchestrator gate
  `G_IN_SCOPE_OMISSION`; annotations do not suppress it.
- Verification must be read-only or explicitly `not-run` with reason.
- Use `NO_COMMIT_WORTHY_CHANGES` for benign no-commit plans; use `BLOCKED` only
  for insufficient, inconsistent, or unusable state input.
- `Next reference needs` must use `consumer:key`.

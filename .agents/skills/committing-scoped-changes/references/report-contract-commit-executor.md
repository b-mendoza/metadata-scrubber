# Commit Executor Report Contract

Return this exact structure for one approved group. Do not include raw diffs or
full command logs.

```markdown
COMMIT_EXECUTE: PASS | VERIFY_FAILED | BLOCKED | COMMIT_ERROR | ERROR

Group ID: <group-id>
Message: <commit message>
Commit: <short-sha or none>

Scope check:
  Approved scope present: <yes|no>
  Paths checked: <paths, including rename sides and submodule pointers>
  Scope result: <inside|blocked:detail>

Index preservation:
  Digest method: <patch-id|index-blob-oids>
  Pre-attempt digest: <value>
  Isolation method: <not-needed or exact method>
  Diverged preserved paths: <none or paths>
  Post-attempt digest: <value or unavailable>
  Preservation result: <matched|not-needed|blocked|mismatch>

Staged diff evidence:
  Staged paths: <paths>
  Plan match: exact | mismatch:<detail>

Verification:
  Command: <command or not-run>
  Policy result: <valid-read-only|rejected|approved-unverified>
  Result: <pass|fail|not-run>
  Output summary: <bounded one-line summary>

Recovery classification: <none|same-scope-same-group-retry|needs-user-decision|terminal>
Retry delta: <required for same-scope-same-group-retry>
Attempt cleanup: <not-started|not-needed|restored with digest evidence|blocked>
Next reference needs: <none or consumer:key list>
References fetched: <none or URL -> one-line conclusion>
Reason: <required for non-PASS>
Decision needed: <required for VERIFY_FAILED needs-user-decision or BLOCKED needing user input>
```

Contract rules:

- `APPROVED_COMMIT_SCOPE` missing is `BLOCKED`; never fall back to
  `CHANGE_PATHS`.
- `Plan match: exact` requires the staged path list.
- Preservation claims require before/after digest values or `not-needed`.
- Naive unstage/restage is forbidden for preserved paths whose worktree differs
  from the index version.
- `same-scope-same-group-retry` requires `Retry delta`; otherwise use
  `needs-user-decision` or `terminal`.
- Verification `not-run` requires group-level `UNVERIFIED_COMMIT_APPROVED`.

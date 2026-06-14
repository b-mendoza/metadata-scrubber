# Orchestrator Report Contract

Use this contract for every success, waiting, no-change, blocked,
verification-failed, commit-error, or error response. Keep it compact. Do not
include raw diffs, full command logs, or copied external or ticket text.

## Success

```markdown
COMMIT_SCOPED_CHANGES: SUCCESS

Commit authority: <COMMIT_REQUEST_QUOTE>

Commits created:
- <short-sha> <message>
  Summary: <one line>
  Verification: <command or not-run with approval> -> <result>
  Staged paths: <paths>
  Plan match: exact
  Preservation digest: <method> before=<value> after=<value> result=<matched|not-needed>

Approved scope expansions: <none or exact paths + user decision>
Approved omissions: <none or exact omitted changes + annotations>
Remaining scoped changes: <none or compact path summary>
Unrelated work left untouched: <none or compact path/count summary>
Post-commit refresh: <summary of final refresh>
References fetched: <none or URL -> one-line conclusion>
```

## Waiting Status

```markdown
COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT

Source phase: <intake|state|planning|gates|execution|refresh>
Question: <one targeted question>
Reason: <why this is needed before continuing>

Resume state:
  Resume node: <flow node or phase.step>
  APPROVED_COMMIT_SCOPE: <exact paths>
  Plan digest: <group ids + messages, or none>
  Remaining group queue: <group ids/messages>
  Attempt counters: <group id -> count>
  Commits created: <short-sha + message, or none>
  User decisions: <prior gate/clarification decisions, or none>
  Pending question: <same as Question>
  Replan count: <n of max 3>
  Clarification counts: <phase -> n of max 2>
```

## Terminal Status

```markdown
COMMIT_SCOPED_CHANGES: BLOCKED | NO_SCOPED_CHANGES | VERIFY_FAILED | COMMIT_ERROR | ERROR

Commit authority: <COMMIT_REQUEST_QUOTE or unavailable>
Source phase: <intake|state|planning|gates|execution|refresh>
Reason: <specific source and evidence>
Commits created before status: <none or short-sha + message>
Current approved scope: <exact paths>
Remaining scoped changes: <unknown or compact path summary>
Unrelated work left untouched: <unknown or compact path/count summary>
Attempt cleanup: <not-started|not-needed|digest evidence and result>
References fetched: <none or URL -> one-line conclusion>
Next safe action: <user action or none>
```

## Contract Rules

- Every `NEEDS_CONTEXT` response includes the full `Resume state` block.
- Every success that claims staged-diff review includes `Staged paths` and
  `Plan match`.
- Every success or post-staging terminal status includes preservation digest
  evidence or `not-needed`.
- Verification `not-run` is valid only when the report names the group-level
  user approval from `G_UNVERIFIED_COMMIT`.

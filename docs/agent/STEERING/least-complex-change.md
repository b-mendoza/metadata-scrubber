# Choose the least complex change that fits the current need

Scope: every task.

Why: extra abstractions and unrelated changes add work without solving the current problem.

## Do's
### Keep use cases explicit and limit each hunk to the task

Before implementation, check whether fewer abstractions solve the problem. Choose a design that a junior developer can understand in five minutes. Write separate, explicit application code for each use case. Do not replace it with one general function for many use cases. Delete a helper that only removes duplication and keep that code at each call site.

Make each diff hunk traceable to the goal. Exclude unrelated refactors and reformatting. Extend the canonical file when it can hold the change. Add documentation, helper scripts, abstractions, or test files only when the task requires them. Report unrelated bugs and cleanup options instead of fixing them.

Add a compatibility shim, deprecation path, or fallback only for a real contract, such as a published API, persisted data, or deployed clients. Preserve the contract when needed. If no consumer requires the old path, delete it.

```text
Hypothetical change: one upload use case needs a new admission decision.
Keep that decision explicit in the use case and update its existing tests.
Preserve the wire shape required by deployed clients. Leave unrelated cleanup untouched.
```

## Don'ts
### Do not generalize for future callers or expand the diff beyond the goal

```text
No caller needs a shared pipeline, but create one for possible future formats.
Reformat unrelated files while changing admission.
Keep a legacy fallback without identifying a real consumer or persisted contract.
```

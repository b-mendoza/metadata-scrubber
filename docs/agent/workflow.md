# Workflow and task scoping

## Simplicity first

- Avoid complex solutions for simple problems. Before implementing, ask:
  - Can this be solved with fewer abstractions?
  - Is this over-engineering for hypothetical future requirements?
  - Would a junior developer understand this in five minutes?

## Scope discipline

- Keep the diff bounded to the task at hand. Do not refactor, reformat, or "improve" code unrelated to the change, even when it looks easy — a reviewer must be able to map every hunk in the diff to the stated goal.
- When you notice an unrelated bug or cleanup opportunity mid-task, record it (an issue, or a note to the user) instead of silently folding the fix into the current change.

## Task management

- Create a GitHub issue for any multi-step or non-trivial task.

## Task decomposition

- Break large tasks into smaller, independently mergeable, testable units.
- A well-scoped subtask has a clear definition of done, is reviewable in isolation, and avoids blocking dependencies.

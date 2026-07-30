# Workflow and task scoping

## Simplicity first

- Avoid complex solutions for simple problems. Before implementing, ask:
  - Can this be solved with fewer abstractions?
  - Is this over-engineering for hypothetical future requirements?
  - Would a junior developer understand this in five minutes?

## Scope discipline

- **The diff contains only what the task requires.** A reviewer must be able to map every hunk to the stated goal: no unrelated refactors or reformatting, and no new files (documentation, helper scripts, abstractions, test files) when the task doesn't require them and extending the canonical file will do. Record unrelated bugs and cleanup opportunities as a note to the maintainer instead of silently folding them in.
- **Build for real consumers only.** Compatibility shims, deprecation paths, and "just in case" fallbacks exist solely for actual contracts — a published API, persisted data, deployed clients. Otherwise make the change cleanly and delete the old path.

## Task management

- Create a GitHub issue for any multi-step or non-trivial task.

## Task decomposition

- Break large tasks into smaller, independently mergeable, testable units.
- A well-scoped subtask has a clear definition of done, is reviewable in isolation, and avoids blocking dependencies.

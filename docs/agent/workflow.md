# Workflow and task scoping

## Simplicity

- Use a solution with the least complexity that solves the problem. Before implementation, check whether fewer abstractions can solve it. Reject design made for possible future requirements that no current consumer has. Choose a design that a junior developer can understand in five minutes.

## Scope control

- Keep each diff limited to the task requirements. A reviewer must be able to map each hunk to the stated goal. Exclude unrelated refactors and reformatting. Do not add documentation, a helper script, an abstraction, or a test file when the task does not require it. Extend the canonical file when the task does not require a new file and the canonical file can hold the change. Report unrelated bugs and cleanup options to the maintainer instead of adding them to the diff.
- Build compatibility code for real consumers. Add a compatibility shim, deprecation path, or fallback when an actual contract requires it. Actual contracts include a published API, persisted data, and deployed clients. If no contract requires the old path, make the change and delete that path.

## Task management

- Propose a GitHub issue for each multi-step or non-trivial task. The required workflow in the root agent guide still applies. Do not create the issue unless the user asks.

## Task decomposition

- Split a large task into smaller units. Developers must be able to merge and test each unit without another unit.
- Give each subtask a clear definition of done. Make it possible to review the subtask by itself. Scope the subtask to avoid dependencies that block its work.

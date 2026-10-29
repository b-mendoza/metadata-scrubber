# Workflow and task scoping

These are general work practices. For facts, the code is the source of truth.

## Simplicity

- Use the simplest solution that solves the problem. Before you write code, check whether fewer layers can solve it. Do not design for needs that no current caller has. Choose a design that a new developer can understand in five minutes.

## Scope control

- Keep each diff limited to the task requirements. A reviewer must be able to map each hunk to the stated goal. Exclude unrelated refactors and reformatting. Do not add documentation, a helper script, an abstraction, or a test file when the task does not require it. Change the existing file when the task does not need a new file and that file can hold the change. Report unrelated bugs and cleanup options to the maintainer instead of adding them to the diff.
- Add a compatibility shim only when a real contract needs it. Real contracts include a published API, stored data, and deployed clients. If no contract needs the old path, make the change and delete that path.

Keep `POST /api/files/download-grant`. Clients call that path.

When you rename a private helper that has no callers, delete the old name. Do not leave a wrapper that only calls the new name.

## Task management

- Propose a tracked work item for each multi-step or non-trivial task. Create it only when the user asks.

## Task decomposition

- Split a large task into smaller units. Developers must be able to merge and test each unit without another unit.
- Give each subtask a clear definition of done. Make it possible to review the subtask by itself. Scope the subtask to avoid dependencies that block its work.

# Agent Guide — metadata-scrubber

`metadata-scrubber` is a web app that strips metadata from uploaded files: a monorepo with a Go HTTP backend (`backend/`) and a TypeScript/React frontend on TanStack Start + Vite (`frontend/`, package manager `pnpm`).

## Documentation model

This repo keeps two tiers of agent documentation. Maintain the split when you add or edit docs:

- **Long-lived guidance** — `AGENTS.md` files and `docs/agent/` directories. Principles and guidelines with general examples only; no source-code paths or code snippets, so they stay true as the code changes.
- **Short-lived references** — Markdown files directly under a `docs/` directory (root or service). Current-state descriptions: architecture, file structure and conventions, command references. Each carries a banner saying it must be updated when the code changes.

## Always

- Before editing under `backend/` or `frontend/`, read that service's `AGENTS.md` first. It owns the build, lint, and test commands for its tree and may override anything here.
- After a substantive change, run the affected service's lint check; before committing, run its test suite. Each service's `AGENTS.md` names the exact commands.
- Passing tests is a floor, not proof. Confirm the service's checks pass before calling the work done; when unsure whether a change is correct, escalate rather than declare success.
- The linter configuration is the enforced source of truth for style in every service. Prefer fixing a finding over suppressing it; suppress inline only when the rule is genuinely wrong for the case, and say why.
- Editing is not permission to publish. Do not commit, push, open a pull request, or create an issue unless explicitly asked; when committing, stage only the paths the task touched.

## Subagents

Delegating to subagents keeps the main thread's context focused and lets independent work run in parallel. Use them deliberately:

- **When a skill or task tells you to, do it.** If a skill, workflow, or task description states, implies, or steers you to delegate, dispatch, orchestrate, or hand off work to a subagent, follow that direction rather than doing it inline.
- **Reach for a subagent when the work fits one.** Broad searches or audits across many files, self-contained investigations, and independent subtasks that can run concurrently are good candidates — dispatch them and keep the conclusion, not the intermediate file dumps.
- **Keep delegation scoped.** Give each subagent a clear objective and a definition of done, and pass along any constraints that bound its work so it does not act beyond the intended scope.
- **When you are unsure whether to delegate, ask.** If it is not clear that a task should go to a subagent — or which one — check before dispatching rather than guessing.

## Open when relevant

Long-lived guides:

- [Naming conventions](docs/agent/naming-conventions.md) — how to name variables, arguments, and functions, with good/bad examples.
- [Code design](docs/agent/code-design.md) — contracts at the boundaries, failing loudly, comments, and dependency injection.
- [Testing principles](docs/agent/testing.md) — what and how to test, across services.
- [Workflow and task scoping](docs/agent/workflow.md) — simplicity, scope discipline, issues, and decomposition.
- [Verifying your work](docs/agent/verification.md) — what "done" requires beyond green tests.

Current-state references (short-lived; verify against the code):

- [Repository architecture](docs/architecture.md) — layout of the monorepo and links to each service's references.

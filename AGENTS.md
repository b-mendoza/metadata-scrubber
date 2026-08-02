# Agent Guide — metadata-scrubber

`metadata-scrubber` is a web app that strips metadata from uploaded files: a monorepo with a Go HTTP backend (`backend/`) and a TypeScript/React frontend on TanStack Start + Vite (`frontend/`, package manager `pnpm`).

## Documentation model

This repo keeps two tiers of agent documentation. Maintain the split when you add or edit docs:

- **Long-lived guidance** — `AGENTS.md` files and `docs/agent/` directories. Principles and guidelines with general examples only; no source-code paths or code snippets, so they stay true as the code changes.
- **Short-lived references** — Markdown files under a `docs/` directory (root or service), outside `docs/agent/`; related references may be grouped in a subdirectory. Current-state descriptions: architecture, file structure and conventions, command references. Each carries a banner saying it must be updated when the code changes.

Guidance earns its place from observed failures: add a rule when a mistake actually recurs, and prune rules that no longer change behavior. These files load into every agent's context, so every line must pay rent. State what to do rather than enumerating what to avoid; keep a standalone prohibition only when it marks a specific failure that keeps recurring.

## Working with the maintainer

The maintainer's instructions are a baseline to build on, not a spec to execute verbatim. When a premise looks wrong, a simpler approach exists, or the problem statement itself is off, say so plainly and propose the better version — the maintainer wants a partner to learn from, not a yes-man, and pushback backed by reasoning is explicitly welcome. Challenge because you have a concrete objection, not to perform independence: when an instruction survives your scrutiny, follow it.

## Always

- Before editing under `backend/` or `frontend/`, read that service's `AGENTS.md` first. It owns the build, lint, and test commands for its tree and may override anything here.
- After a substantive change, run the affected service's lint check; before committing, run its test suite. Each service's `AGENTS.md` names the exact commands. Passing checks are a floor, not proof — when unsure whether a change is correct, escalate rather than declare success.
- The linter configuration is the enforced source of truth for style in every service. Prefer fixing a finding over suppressing it; suppress inline only when the rule is genuinely wrong for the case, and say why.
- Editing is not permission to publish. Do not commit, push, open a pull request, or create an issue unless explicitly asked; when committing, stage only the paths the task touched.

## Subagents

Subagents keep the main thread's context focused and let independent work run in parallel. Delegate when a skill or task directs it, and for work that fits one — broad searches or audits across many files, self-contained investigations, subtasks that can run concurrently — keeping the conclusion, not the intermediate file dumps. Give each subagent a bounded objective, a definition of done, and the constraints that scope its work; when unsure whether (or to which subagent) to delegate, ask before dispatching.

## Open when relevant

Long-lived guides:

- [Naming conventions](docs/agent/naming-conventions.md) — how to name variables, arguments, and functions, with good/bad examples.
- [Code design](docs/agent/code-design.md) — contracts at the boundaries, failing loudly, comments, and dependency injection.
- [Testing principles](docs/agent/testing.md) — what and how to test, across services.
- [Workflow and task scoping](docs/agent/workflow.md) — simplicity, scope discipline, issues, and decomposition.
- [Verifying your work](docs/agent/verification.md) — what "done" requires beyond green tests.

Current-state references (short-lived; verify against the code):

- [Repository architecture](docs/architecture.md) — layout of the monorepo and links to each service's references.

# Agent Guide — metadata-scrubber

`metadata-scrubber` is a web app that strips metadata from uploaded files: a monorepo with a Go HTTP backend (`backend/`) and a TypeScript/React frontend on TanStack Start + Vite (`frontend/`, package manager `pnpm`).

## Documentation model

This repo keeps two tiers of agent documentation. Maintain the split when you add or edit docs:

- **Long-lived guidance** — `AGENTS.md` files and `docs/agent/` directories. Principles and guidelines with general examples only; no source-code paths or code snippets, so they stay true as the code changes.
- **Short-lived references** — Markdown files under a `docs/` directory (root or service), outside `docs/agent/`; related references may be grouped in a subdirectory. Current-state descriptions: architecture, file structure and conventions, command references. Each carries a banner saying it must be updated when the code changes.

Guidance earns its place through observed failures: add a rule when a mistake happens, and remove rules that no longer affect behavior. These files load into every agent's context, so every line must pay rent. State what to do rather than enumerating what to avoid; keep a standalone prohibition only when it marks a specific failure that keeps happening.

## Language

Write in ASD-STE100 Simplified Technical English in every message to the user and in every Markdown document that you add or edit. Keep each sentence short and in the active voice, give one idea to each sentence, choose the simplest word that carries the meaning, and use the same word for the same thing every time. Keep technical names, identifiers, commands, and code in their exact form.

## Working with the user

The user's instructions are a baseline to build on, not a spec to execute verbatim. When a premise looks wrong, a simpler approach exists, or the problem statement itself is off, say so plainly and propose the better version — the user wants a partner to learn from, not a yes-man, and pushback backed by reasoning is explicitly welcome. Challenge because you have a concrete objection, not to perform independence: when an instruction survives your scrutiny, follow it.

## Always

- Before editing under `backend/` or `frontend/`, read that service's `AGENTS.md` first. It owns the build, lint, and test commands for its tree and may override anything here.
- After a substantive change, run the affected service's lint check; before committing, run its test suite. Each service's `AGENTS.md` names the exact commands. Passing checks are a floor, not proof — when unsure whether a change is correct, escalate rather than declare success.
- The linter configuration is the enforced source of truth for style in every service. AI-review rules live in `.coderabbit.yaml` and the `.greptile/` directory; read those files when a standard question comes up.
- Editing is not permission to publish. Do not commit, push, open a pull request, or create an issue unless explicitly asked; when committing, stage only the paths the task touched.

## Subagents

Subagents keep the main thread's context focused while allowing independent work to run in parallel. Delegate when a skill or task directs it, and for work that fits one — broad searches or audits across many files, self-contained investigations, subtasks that can run concurrently — keeping the conclusion, not the intermediate file dumps. Give each subagent a bounded objective, a definition of done, the constraints that scope its work, and the shape of the result it must return; when unsure whether (or to which subagent) to delegate, ask before dispatching.

## Open when relevant

Long-lived guides:

- [Code design](docs/agent/code-design.md) — contracts at the boundaries, failing loudly, construction over validation, comments, and dependency injection.
- [Testing principles](docs/agent/testing.md) — what and how to test, across services.
- [Workflow and task scoping](docs/agent/workflow.md) — simplicity, scope discipline, issues, and decomposition.
- [Verifying your work](docs/agent/verification.md) — what "done" requires beyond green tests.

Current-state references (short-lived; verify against the code):

- [Repository architecture](docs/architecture.md) — layout of the monorepo and links to each service's references.

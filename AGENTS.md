# Agent Guide — metadata-scrubber

`metadata-scrubber` is a web app that strips metadata from uploaded files: a monorepo with a Go HTTP backend (`backend/`) and a TypeScript/React + Vite frontend (`frontend/`, package manager `pnpm`).

## Repository layout

| Path | Contents |
| --- | --- |
| [`backend/`](./backend/) | Go HTTP service (scrubbing, request handling, config). Has its own `AGENTS.md`. |
| [`frontend/`](./frontend/) | TypeScript/React + Vite app, managed with `pnpm`. Has its own `AGENTS.md`. |
| [`docs/`](./docs/) | Cross-cutting notes, including the agent guides linked below. |
| `docker-compose.yml` | Runs the backend and frontend together locally. |

## Always

- Before editing under `backend/` or `frontend/`, read that service's `AGENTS.md` first. It owns the build, lint, and test commands for its tree and may override anything here.
- Passing tests is a floor, not proof. After a change, run the affected service's checks and confirm they pass before calling the work done; when unsure whether a change is correct, escalate rather than declare success.

## Open when relevant

- [Naming conventions](docs/agent/naming-conventions.md) — how to name variables, arguments, and functions, with good/bad examples.
- [Verifying your work](docs/agent/verification.md) — what "done" requires beyond green tests.

# Repository Architecture (current state)

> **Short-lived reference.** This file describes the current state of the repository and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Go HTTP service (scrubbing, request handling, config). Has its own `AGENTS.md`. |
| `frontend/` | TypeScript/React app on TanStack Start + Vite, managed with `pnpm`. Has its own `AGENTS.md`. |
| `docs/` | Cross-cutting docs: long-lived agent guides under `docs/agent/`, current-state references like this file. |
| `docker-compose.yml` | Runs the backend and frontend together locally. |

## Per-service current-state references

- Backend: [architecture](../backend/docs/architecture.md), [commands](../backend/docs/commands.md).
- Frontend: [architecture](../frontend/docs/architecture.md), [file structure and conventions](../frontend/docs/conventions.md), [commands](../frontend/docs/commands.md).

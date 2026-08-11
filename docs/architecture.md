# Repository Architecture (current state)

> **Short-lived reference.** This file describes the current state of the repository and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Go HTTP service (scrubbing, request handling, config, storage). Has its own `AGENTS.md`. |
| `frontend/` | TypeScript/React app on TanStack Start + Vite, managed with `pnpm`. Has its own `AGENTS.md`. |
| `docs/` | Cross-cutting docs: long-lived agent guides under `docs/agent/`, current-state references like this file. |
| `docker-compose.yml` | Runs the backend and frontend together locally. |

## Service integration

- The frontend is the public entry point. Frontend server code calls the backend over HTTP at the URL in the `BACKEND_URL` environment variable.
- On Vercel, `vercel.json` injects `BACKEND_URL` as a service binding to the backend container. Locally it comes from `docker-compose` or the shell.
- The only current consumer is a health check in `frontend/src/domains/products/products-router.mod.server.ts`.
- Both services gate uploads. The frontend accepts the types in `UPLOADABLE_MIME_TYPES` (JPEG, PNG, WebP, PDF) up to `MAX_FILE_SIZE_BYTES`. The backend accepts PDF only (offset-zero `%PDF-` sniff). A change to the accepted types or the size limit must land in both services.

## Per-service current-state references

- Backend: see the reference list in [backend/AGENTS.md](../backend/AGENTS.md).
- Frontend: see the reference list in [frontend/AGENTS.md](../frontend/AGENTS.md).

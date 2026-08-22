# Repository architecture

> **Short-lived reference.** This file describes the current state of the repository. Update it when the repository changes. If this file does not match the code, follow the code.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Go HTTP backend service for scrubbing, request handling, configuration, and storage. The service has its own `AGENTS.md`. |
| `frontend/` | TypeScript/React frontend service on TanStack Start and Vite. `pnpm` manages the service. The service has its own `AGENTS.md`. |
| `docs/` | Cross-service documentation. Long-lived guidance is under `docs/agent/`. Short-lived references include this file. |
| `docker-compose.yml` | Runs the backend and frontend together for local development. |

## Service integration

- Clients send public requests to the frontend. Frontend server code calls the backend over HTTP. The frontend server code uses the URL in the `BACKEND_URL` environment variable.
- On Vercel, `vercel.json` injects `BACKEND_URL` as a service binding to the backend container. For local development, `docker-compose` or the shell supplies the value.
- The health check in `frontend/src/domains/products/products-router.mod.server.ts` is the only current consumer of the backend HTTP API.
- Both services restrict uploads. The frontend accepts the types in `UPLOADABLE_MIME_TYPES`: JPEG, PNG, WebP, and PDF. It accepts files up to `MAX_FILE_SIZE_BYTES`. The backend accepts PDF and no other type. It checks for `%PDF-` at offset zero. Apply each accepted-type or size-limit change to both services.

## Short-lived references for each service

- See the reference list in [backend/AGENTS.md](../backend/AGENTS.md) for the backend.
- See the reference list in [frontend/AGENTS.md](../frontend/AGENTS.md) for the frontend.

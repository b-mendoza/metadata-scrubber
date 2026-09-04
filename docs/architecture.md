# Repository architecture

> **Short-lived reference.** This file describes the current state of the repository. Update it when the repository changes. If this file does not match the code, follow the code.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Go HTTP backend service for scrubbing, request handling, configuration, and private storage. The service has its own `AGENTS.md`. |
| `frontend/` | TypeScript and React frontend service on TanStack Start and Vite. `pnpm` manages the service. The service has its own `AGENTS.md`. |
| `docs/` | Cross-service documentation. Long-lived guidance is under `docs/agent/`. Short-lived references include this file. |
| `docker-compose.yml` | Runs the backend and frontend together for local development. |

## Service integration

- Clients send public application requests to the frontend. Frontend server code calls the backend over HTTP.
- The frontend validates `BACKEND_URL` and creates request-scoped Ky clients with this URL as the base URL.
- On Vercel, `vercel.json` injects `BACKEND_URL` as a service binding to the backend container. For local development, `docker-compose` or the shell supplies the value.
- The products tRPC router calls backend health.
- The wizard tRPC router provides typed proxies for workflow configuration, upload grants, dry-run inspection, revision-bound scrubbing, download-grant refresh, and confirmed deletion.
- The tRPC workflow sends only small JSON values. It does not send file bytes.
- The Go backend owns the maximum source size. The frontend reads it at runtime through `getWorkflowConfig`.
- The scrub workflow accepts PDF input only. The backend checks for `%PDF-` at offset zero and then parses the PDF structure.
- The earlier frontend-local upload metadata route still accepts JPEG, PNG, WebP, and PDF values. It does not persist files and is not part of the typed backend workflow.
- Source objects are private. The backend stores each sanitized result under an immutable source-revision key. The frontend uses the canonical source ETag to bind review, scrub, and download refresh to one revision.
- The backend confirms full-flow deletion before it reports success. The operation removes the source and every sanitized revision for the file.
- Backend workflow errors contain safe public text. The frontend maps them to safe tRPC errors and does not return provider details.

## Short-lived references for each service

- See the reference list in [backend/AGENTS.md](../backend/AGENTS.md) for the backend.
- See the reference list in [frontend/AGENTS.md](../frontend/AGENTS.md) for the frontend.

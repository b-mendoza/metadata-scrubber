# Repository architecture

> **Factual reference.** This file describes the current state of the repository. Update it when the repository changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Go HTTP backend in a Cloudflare Container behind a private Worker. It handles scrubbing, requests, configuration, and private storage. The service has its own `AGENTS.md`. |
| `frontend/` | TypeScript and React frontend Worker on TanStack Start and Vite. `pnpm` manages the service. The service has its own `AGENTS.md`. |
| `terraform/` | Terraform configuration for the production R2 bucket CORS policy. State lives in the private R2 bucket `metadata-scrubber-terraform-state`. A manual workflow applies changes. |
| `docs/` | Cross-service documentation. General guides are under `docs/agent/`. Factual references include this file. |
| `docker-compose.yml` | Runs only the Go backend for local development. |

## Service integration

- Clients send public application requests to the frontend Cloudflare Worker, `metadata-scrubber`.
- Frontend server code calls `metadata-scrubber-backend` through the `BACKEND` service binding. This backend Worker forwards requests to the Go backend in a Cloudflare Container.
- The backend Worker has no public URL. The browser cannot call the Go backend directly.
- The frontend validates `BACKEND_URL` and creates request-scoped Ky clients with this base URL. The service binding ignores the URL host.
- The products tRPC router calls backend health.
- The wizard tRPC router provides typed proxies for workflow configuration, upload grants, dry-run inspection, revision-bound scrubbing, download-grant refresh, and confirmed deletion.
- The tRPC workflow sends only small JSON values. It does not send file bytes.
- The Go backend owns the maximum source size. The frontend reads it at runtime through `getWorkflowConfig`.
- The scrub workflow accepts PDF input only. The backend checks for `%PDF-` at offset zero and then parses the PDF structure.
- The browser uploads the PDF directly to private R2 with a presigned PUT URL. No frontend route accepts file bytes.
- Source objects are private. The backend stores each sanitized result under an immutable source-revision key. The frontend uses the canonical source ETag to bind review, scrub, and download refresh to one revision.
- The backend confirms full-flow deletion before it reports success. The operation removes the source and every sanitized revision for the file. Confirmed deletion shows absence at the time of the checks. A scrub that is already in progress can still write a cleaned file after that.
- Backend workflow errors contain safe public text. The frontend maps them to safe tRPC errors and does not return provider details.

## Factual references for each service

- See the [backend agent guide](../backend/AGENTS.md) for general practices and factual references.
- See the [frontend agent guide](../frontend/AGENTS.md) for general practices and factual references.

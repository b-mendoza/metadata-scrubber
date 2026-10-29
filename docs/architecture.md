# Repository architecture

> **Factual reference.** This file describes the current state of the repository. Update it when the repository changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Layout

| Path                 | Contents                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `backend/`           | Go HTTP backend service for scrubbing, request handling, configuration, and private storage. The service has its own `AGENTS.md`.  |
| `frontend/`          | TypeScript and React frontend service on TanStack Start and Vite. `pnpm` manages the service. The service has its own `AGENTS.md`. |
| `docs/`              | Cross-service documentation. General guides are under `docs/agent/`. Factual references include this file.                         |
| `docker-compose.yml` | Runs the backend and frontend together for local development.                                                                      |

## Worktree setup

`scripts/setup-worktree.sh` installs the standalone `pnpm` binary when that copy is missing. `pnpm` then reads `frontend/package.json` and installs the pinned `pnpm` and Node.js versions. The script installs frontend dependencies with `pnpm install --frozen-lockfile`. `go` must be on PATH. The script also runs `go -C backend mod download`. This command downloads all modules in `backend/go.mod`, including the Go tools, into the Go module cache. Later Go commands can then run without network access, for example in an agent sandbox. Run the script from the repository root with `bash scripts/setup-worktree.sh`.

The script finds the main checkout through the Git common directory. It copies `backend/.env` and `frontend/.env` from that checkout when the source files exist and the worktree lacks them. It does not print env file contents.

The script then installs Git hooks with `go -C backend tool task hooks:install`. Git hooks live in the shared Git directory, so this step also updates the hooks for the main checkout and every other worktree. The step fails when `core.hooksPath` is set, because lefthook does not install hooks over that setting.

Cursor reads `.cursor/worktrees.json`. On Unix it runs the setup script.

T3 Code reads `t3.json`. New threads use a worktree. T3 Code does not run the scripts in `t3.json` directly. Import them from the "From t3.json" section of the project actions menu. After the import, T3 Code runs the setup script when it creates a worktree. It waits for the script to finish because `async` is `false`. T3 Code keeps its own copy of each imported script. Later changes to `t3.json` do not apply until you change that copy in T3 Code.

## Service integration

- Clients send public application requests to the frontend. Frontend server code calls the backend over HTTP.
- The frontend validates the backend URL and creates request-scoped Ky clients with this URL as the base URL.
- On Vercel, `vercel.json` supplies the backend URL through a service binding to the backend container. For local development, `docker-compose` or the shell supplies the value.
- The first three `vercel.json` rewrites proxy `/relay/static/*` and `/relay/array/*` to US Cloud PostHog assets. They proxy other `/relay/*` requests to US Cloud PostHog ingestion. These rewrites run before the frontend catch-all.
- The browser tRPC client reads the current PostHog IDs for each request after the SDK initializes. It sends `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID`. An uninitialized SDK sends neither header. The frontend server forwards these incoming headers unchanged on workflow calls only. The backend validates them and uses them for server events. Health calls do not forward them.
- See [backend telemetry](../backend/docs/architecture.md#posthog-telemetry) and [browser analytics](../frontend/docs/architecture.md#browser-analytics) for service details.
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

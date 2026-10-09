# Current backend architecture

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

The backend is a Go HTTP service. It grants direct uploads to private storage. It inspects stored PDF files. It returns download grants for cleaned files.

## Internal package layout

| Package | Responsibility |
| --- | --- |
| `scrub` | `scrub` parses and validates PDF bytes. It inspects metadata and removes supported metadata. It enforces the 10 MiB input limit. |
| `sniff` | `sniff` applies the strict offset-zero `%PDF-` byte policy to select PDF intake candidates. This check does not establish structural validity. |
| `handler` | `handler` provides the health and file-workflow HTTP handlers. It creates upload grants. It handles workflow configuration, dry-run inspection, revision-bound scrubbing, download-grant refresh, and confirmed deletion. It applies strict JSON validation and returns safe public errors. |
| `httpx` | `httpx` provides HTTP helpers that handlers share. The helpers handle CORS and safe request logging. The helpers return error responses. The `httpx/header` and `httpx/mediatype` subpackages handle headers and media types. |
| `bindings` | `bindings` provides middleware that attaches configuration and storage dependencies to each request context. |
| `config` | `config` reads service and Cloudflare R2 connection configuration from the environment. It validates the configuration before startup. |
| `storage` | `storage` defines provider-neutral upload, workflow, and lifecycle ports. It includes a synchronized in-memory fake and a Cloudflare R2 adapter. Source objects are private. The R2 adapter checks exact source existence. |

## Tooling layout

| Package | Responsibility |
| --- | --- |
| `lint/nohiddentestsignal` | `lint/nohiddentestsignal` provides a Go analyzer. The analyzer reports test skips and `time.Sleep` calls in Go test files. |
| `lint/noemptyinterface` | `lint/noemptyinterface` provides a Go analyzer. The analyzer reports `any`, literal empty interfaces, and named types or aliases that resolve to empty interfaces in application code. |
| `lint/cmd/analyzers` | `lint/cmd/analyzers` runs both analyzers on application packages. The lint targets select the service root and all packages under `internal/`. |

Stock `golangci-lint` checks all packages, including analyzer code. Git ignores the generated `coverage.out` file.

TypeScript checks the Worker entry with the types that `wrangler types` generates.

## HTTP API

The server registers these routes:

- `GET /api/health`
- `GET /api/files/config`
- `POST /api/uploads`
- `POST /api/files/dry-run`
- `POST /api/files/scrub`
- `POST /api/files/download-grant`
- `POST /api/files/delete`

The config route returns the backend-owned maximum file size of `10_485_760` bytes. The workflow POST routes accept small JSON contracts, not file bytes. Upload uses `uuid.NewV4().String()` to create each lowercase UUIDv4 storage key with the `uploads/` prefix.

The download-grant route checks one exact sanitized revision. It returns a fresh 15-minute grant and a UTC RFC 3339 whole-second expiry. It does not download the source or process PDF bytes.

The delete route removes the source and all sanitized revisions for one file. The R2 adapter lists every sanitized-prefix page and deletes each page as one batch. It checks the provider delete result for each page. It then verifies that the source and sanitized prefix are empty. The operation is idempotent. A verified remaining object produces a `409 Conflict` response. Only verified deletion returns `{ "status": "deleted" }`. Confirmed deletion shows absence at the time of the checks. A scrub that is already in progress can still write a cleaned file after that.

## Deployment

Cloudflare Containers runs the unchanged Go image behind the private `metadata-scrubber-backend` Worker. The frontend Worker `metadata-scrubber` calls it through the `BACKEND` service binding. Clients cannot call the backend directly. The backend Worker disables `workers.dev` and preview URLs. It has no public routes.

- `BackendContainer` uses the `BACKEND_CONTAINER` Durable Object binding. The Worker sends every request to one named container instance. The two-job PDF admission limit applies to this one instance.
- The configuration uses a custom instance type to match the Vercel Standard size. It has 1 vCPU, 3 GiB of memory, and the default 2 GB of disk. Cloudflare requires at least 3 GiB of memory for 1 vCPU. [Cloudflare's limits reference](https://developers.cloudflare.com/containers/platform/limits/#custom-instance-types) lists these limits. An out-of-memory kill stops the process and fails its active requests.
- Worker secrets hold `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. `secrets.required` makes deploy fail when one is missing. The non-secret `R2_BUCKET` variable is `metadata-scrubber-prod`. The Worker passes all four values to the container through `envVars`. It does not set `PORT`.
- A running container keeps the environment from its start. New secret values and Worker environment changes apply at the next container start. The container stops after 10 minutes without requests. This is the library default. A deploy with an unchanged image does not restart the container.

## Runtime

`task run` in `backend/` starts the Go process with the shell environment. The Go process has no `.env` loader. `pnpm exec wrangler dev` in `backend/` starts the Worker and container with Docker. Wrangler reads local secrets from `.dev.vars`. That file can also override `R2_BUCKET` for local use. Git and Docker exclude `.dev.vars*`.

Before startup, the service validates `PORT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. The R2 settings are required. `PORT` defaults to 8080. [`.env.example`](../.env.example) lists these variables with example values.

- `main.go` configures JSON slog logging. It validates the service configuration and the Cloudflare R2 connection configuration. It creates one long-lived R2 adapter from the validated configuration without contacting R2. It passes the adapter into server construction.
- Server construction creates one handler and one buffered admission channel with a fixed capacity of two. The permits limit active PDF work. They do not limit waiting requests or memory use. Server construction does not register the superseded multipart endpoint.
- Server construction uses request bindings to inject the validated configuration and the provider-neutral `storage.Storage` interface before routing. Handlers do not construct provider clients or receive AWS SDK types.
- Dry-run acquires the shared permit before source download. It holds the permit through the intake check and PDF inspection.
- Scrub checks that the source exists before it checks the sanitized revision cache. A missing source returns `404 Not Found`. A source-check failure stops later storage and PDF work.
- Scrub acquires the shared permit before source download on a cache miss. It holds the permit through the intake check and PDF cleaning. It releases the permit before sanitized upload. An exact-revision cache hit does not acquire the permit or download the source.
- If a request cannot acquire a permit within two seconds, the server returns `503 Service Unavailable`. Each rejection gets a new whole-second `Retry-After` value. The value uses a two-second base plus uniform random jitter of zero, one, or two seconds. `randomAdmissionJitter` reads one byte with `crypto/rand.Read`. It takes the low two bits and rejects three.
- If the client cancels while the request waits, the server returns `408 Request Timeout`.
- Dry-run returns the source's canonical unquoted ETag. The ETag grammar is exactly 32 lower-case hexadecimal characters. Scrub binds the reviewed source revision to both the conditional source read and the immutable sanitized object key.
- The server applies a read-header timeout. It performs a graceful shutdown on SIGINT or SIGTERM.
- The `go` directive in `go.mod` pins the required Go version.

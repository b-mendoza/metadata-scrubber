# Current backend architecture

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

The backend is a Go HTTP service. It grants direct uploads to private storage. It inspects stored PDF files. It returns download grants for cleaned files.

## Internal package layout

| Package     | Responsibility                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrub`     | `scrub` parses and validates PDF bytes. It inspects metadata and removes supported metadata. It enforces the 10 MiB input limit.                                                                                                                                                            |
| `sniff`     | `sniff` applies the strict offset-zero `%PDF-` byte policy to select PDF intake candidates. This check does not establish structural validity.                                                                                                                                              |
| `handler`   | `handler` provides the health and file-workflow HTTP handlers. It creates upload grants. It handles workflow configuration, dry-run inspection, revision-bound scrubbing, download-grant refresh, and confirmed deletion. It applies strict JSON validation and returns safe public errors. |
| `httpx`     | `httpx` provides HTTP helpers that handlers share. The helpers handle CORS and safe request logging. The helpers return error responses. The `httpx/header` and `httpx/mediatype` subpackages handle headers and media types.                                                               |
| `bindings`  | `bindings` attaches configuration, storage, and an event callback to each request context. It validates browser analytics headers.                                                                                                                                                          |
| `telemetry` | `telemetry` connects workflow outcomes, slog exceptions, and OpenTelemetry logs to PostHog US Cloud. It owns the clients and bounds shutdown waits.                                                                                                                                         |
| `config`    | `config` reads service, Cloudflare R2, and PostHog configuration from the environment. It validates the configuration before startup.                                                                                                                                                       |
| `storage`   | `storage` defines provider-neutral upload, workflow, and lifecycle ports. It includes a synchronized in-memory fake and a Cloudflare R2 adapter. Source objects are private. The R2 adapter checks exact source existence.                                                                  |

## Tooling layout

| Package                   | Responsibility                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint/nohiddentestsignal` | `lint/nohiddentestsignal` provides a Go analyzer. The analyzer reports test skips and `time.Sleep` calls in Go test files.                                                             |
| `lint/noemptyinterface`   | `lint/noemptyinterface` provides a Go analyzer. The analyzer reports `any`, literal empty interfaces, and named types or aliases that resolve to empty interfaces in application code. |
| `lint/cmd/analyzers`      | `lint/cmd/analyzers` runs both analyzers on application packages. The lint targets select the service root and all packages under `internal/`.                                         |

Stock `golangci-lint` checks all packages, including analyzer code. Git ignores the generated `coverage.out` file.

This module owns Task as a Go tool. Run Task with `go tool task`. From the repository root, run `go -C backend tool task`. Verify the install with `go tool task --version`.

This module owns lefthook as a Go tool. Run `task hooks:install` once after you clone. lefthook.yml at the repository root defines the Git hook jobs. Git hooks run `scripts/lefthook` at the repository root. The script builds lefthook with `go -C backend tool -n lefthook` and runs it. It exits 1 when `go` fails.

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

Vercel Fluid compute runs the service in a stateless container. Vercel manages the server.

- One instance serves many requests at the same time. The platform fills a warm instance before it starts a new instance. The platform does not isolate requests from each other.
- Each instance has a small fixed memory limit and few CPUs. An out-of-memory kill stops the process and fails every request in that process.
- The platform controls request time limits. The deployment configuration does not state a duration.
- The platform adds instances when current instances are busy.

## Runtime

The local process uses the shell environment. It has no `.env` loader. [`config.go`](../internal/config/config.go) defines and validates backend settings.

- `main.go` configures JSON slog logging and calls `config.Load()` before it creates clients. It creates one long-lived R2 adapter without contacting R2. It creates telemetry clients and passes the logger and event callback to server construction.
- Server construction creates one handler and one buffered admission channel with a fixed capacity of two. The permits limit active PDF work. They do not limit waiting requests or memory use. Server construction does not register the superseded multipart endpoint.
- Server construction attaches configuration, `storage.Storage`, and the event callback through request bindings before request logging and routing. Panic-completion logs can use the validated browser IDs. Handlers do not construct provider clients or receive SDK types.
- Dry-run acquires the shared permit before source download. It holds the permit through the intake check and PDF inspection.
- Scrub checks that the source exists before it checks the sanitized revision cache. A missing source returns `404 Not Found`. A source-check failure stops later storage and PDF work.
- Scrub acquires the shared permit before source download on a cache miss. It holds the permit through the intake check and PDF cleaning. It releases the permit before sanitized upload. An exact-revision cache hit does not acquire the permit or download the source.
- If a request cannot acquire a permit within two seconds, the server returns `503 Service Unavailable`. Each rejection gets a new whole-second `Retry-After` value. The value uses a two-second base plus uniform random jitter of zero, one, or two seconds. `randomAdmissionJitter` reads one byte with `crypto/rand.Read`. It takes the low two bits and rejects three.
- If the client cancels while the request waits, the server returns `408 Request Timeout`.
- Dry-run returns the source's canonical unquoted ETag. The ETag grammar is exactly 32 lower-case hexadecimal characters. Scrub binds the reviewed source revision to both the conditional source read and the immutable sanitized object key.
- The server applies a read-header timeout. It performs a graceful shutdown on SIGINT or SIGTERM. After the HTTP server stops, telemetry closes the PostHog client and the OpenTelemetry logger provider.
- The `go` directive in `go.mod` pins the required Go version.

## PostHog telemetry

[`internal/telemetry/telemetry.go`](../internal/telemetry/telemetry.go) sends workflow events, exceptions, and OpenTelemetry logs to PostHog US Cloud.

The runtime keeps stdout JSON logging at Info level and higher. Only records sent through `runtime.Logger` enter the remote log handlers. Those handlers send all log levels to PostHog Logs and Error-level records and higher as exceptions. The global slog logger stays local. Export and event queue errors stay local to prevent an export loop.

Workflow handlers enqueue events only after successful response writes. The event callback reads browser IDs from request bindings. An absent distinct ID skips the event. Invalid analytics headers do not fail workflow requests. The [service integration reference](../../docs/architecture.md#service-integration) describes header forwarding.

Workflow events contain no file data. Workflow events and exceptions do not create person profiles. Storage failure logs omit provider text. Request logs include client addresses and User-Agent values. Exception text can include response-write errors.

Delivery is best effort. Shutdown waits are bounded.

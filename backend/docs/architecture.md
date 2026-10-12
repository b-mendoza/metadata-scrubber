# Current backend architecture

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

The backend is a Go HTTP service. It grants direct uploads to private storage. It inspects stored PDF files. It returns download grants for cleaned files.

## Internal package layout

| Package    | Responsibility                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrub`    | `scrub` parses and validates PDF bytes. It inspects metadata and removes supported metadata. It enforces the 10 MiB input limit.                                                                                                                                                            |
| `sniff`    | `sniff` applies the strict offset-zero `%PDF-` byte policy to select PDF intake candidates. This check does not establish structural validity.                                                                                                                                              |
| `handler`  | `handler` provides the health and file-workflow HTTP handlers. It creates upload grants. It handles workflow configuration, dry-run inspection, revision-bound scrubbing, download-grant refresh, and confirmed deletion. It applies strict JSON validation and returns safe public errors. |
| `httpx`    | `httpx` provides HTTP helpers that handlers share. The helpers handle CORS and safe request logging. The helpers return error responses. The `httpx/header` and `httpx/mediatype` subpackages handle headers and media types.                                                               |
| `bindings` | `bindings` provides middleware that attaches configuration, storage, and the narrow workflow-event port to each request context. It validates the anonymous analytics headers.                                                                                                                                                                                |
| `telemetry` | `telemetry` connects workflow outcomes, slog exceptions, and OpenTelemetry logs to PostHog US Cloud. It owns the clients and bounds shutdown waits. |
| `config`   | `config` reads service, Cloudflare R2, and PostHog configuration from the environment. It validates the configuration before startup.                                                                                                                                                      |
| `storage`  | `storage` defines provider-neutral upload, workflow, and lifecycle ports. It includes a synchronized in-memory fake and a Cloudflare R2 adapter. Source objects are private. The R2 adapter checks exact source existence.                                                                  |

## Tooling layout

| Package                   | Responsibility                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint/nohiddentestsignal` | `lint/nohiddentestsignal` provides a Go analyzer. The analyzer reports test skips and `time.Sleep` calls in Go test files.                                                             |
| `lint/noemptyinterface`   | `lint/noemptyinterface` provides a Go analyzer. The analyzer reports `any`, literal empty interfaces, and named types or aliases that resolve to empty interfaces in application code. |
| `lint/cmd/analyzers`      | `lint/cmd/analyzers` runs both analyzers on application packages. The lint targets select the service root and all packages under `internal/`.                                         |

Stock `golangci-lint` checks all packages, including analyzer code. Git ignores the generated `coverage.out` file.

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

The local run process uses the shell environment. It has no `.env` loader. Before startup, the service validates `PORT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `POSTHOG_PROJECT_TOKEN`. `PORT` defaults to 8080. Every other setting is required whenever the backend starts. The PostHog project token must start with `phc_`. [`.env.example`](../.env.example) lists these variables.

- `main.go` configures JSON slog logging. It validates the service configuration and the Cloudflare R2 connection configuration. It validates the PostHog project token. It creates one long-lived R2 adapter from the validated configuration without contacting R2. It creates telemetry clients and passes the logger and workflow-event port into server construction.
- Server construction creates one handler and one buffered admission channel with a fixed capacity of two. The permits limit active PDF work. They do not limit waiting requests or memory use. Server construction does not register the superseded multipart endpoint.
- Server construction uses request bindings to inject the validated configuration, the provider-neutral `storage.Storage` interface, and the `bindings.WorkflowEvents` port before request logging and routing. This gives panic-completion logs the validated analytics IDs. Handlers do not construct provider clients or receive SDK types.
- Dry-run acquires the shared permit before source download. It holds the permit through the intake check and PDF inspection.
- Scrub checks that the source exists before it checks the sanitized revision cache. A missing source returns `404 Not Found`. A source-check failure stops later storage and PDF work.
- Scrub acquires the shared permit before source download on a cache miss. It holds the permit through the intake check and PDF cleaning. It releases the permit before sanitized upload. An exact-revision cache hit does not acquire the permit or download the source.
- If a request cannot acquire a permit within two seconds, the server returns `503 Service Unavailable`. Each rejection gets a new whole-second `Retry-After` value. The value uses a two-second base plus uniform random jitter of zero, one, or two seconds. `randomAdmissionJitter` reads one byte with `crypto/rand.Read`. It takes the low two bits and rejects three.
- If the client cancels while the request waits, the server returns `408 Request Timeout`.
- Dry-run returns the source's canonical unquoted ETag. The ETag grammar is exactly 32 lower-case hexadecimal characters. Scrub binds the reviewed source revision to both the conditional source read and the immutable sanitized object key.
- The server applies a read-header timeout. It performs a graceful shutdown on SIGINT or SIGTERM. After `server.Shutdown`, telemetry flushes and closes the PostHog client and the OpenTelemetry logger provider. Each client gets a separate five-second shutdown limit. A PostHog close that exceeds its deadline can finish in the background.
- The `go` directive in `go.mod` pins the required Go version.

## PostHog telemetry

The ingest host is the fixed constant `https://us.i.posthog.com`. There is no host environment variable. The backend uses `posthog-go` for events and exceptions. It uses the OTLP HTTP log exporter and the `otelslog` bridge for logs.

`slog.NewMultiHandler` sends records to three handlers in order. The first handler keeps the existing stdout JSON output and its Info minimum level. The second handler sends every slog level to the OpenTelemetry batch processor. The third handler uses `posthog.NewSlogCaptureHandler` with a discard output handler. It captures Error-level records and higher as `$exception` events. It does not copy arbitrary slog attributes into exception properties.

The log exporter sends HTTPS requests to `/i/v1/logs`. It sets `Authorization: Bearer <token>`. The logger provider sets the resource attribute `service.name` to `metadata-scrubber-backend`. Log requests and batch exports have five-second timeouts. SDK export errors use local logging to prevent a telemetry feedback loop. The PostHog SDK uses its separate stderr logger for delivery errors.

Request bindings accept `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` only when each value has 1 to 200 printable ASCII characters. Invalid or absent headers do not fail workflow requests. The backend adds no PostHog request-context middleware.

Each successful workflow response enqueues one event:

| Outcome | Event |
| ------- | ----- |
| Upload grant creation | `upload grant created` |
| Dry-run completion | `dry run completed` |
| Scrub completion, including a cache hit | `file scrubbed` |
| Download grant refresh | `download grant refreshed` |
| Confirmed deletion, including an already-empty flow | `file deleted` |

Workflow events use the valid forwarded distinct ID. They set `$process_person_profile` to `false`. They set `$session_id` only when its header is valid. They contain no other application properties. An absent distinct ID skips the event. A storage, processing, or response-write failure sends no completed workflow event. Event queue failures use local logging and do not change the workflow response.

Unexpected storage failures log one Error record with the fixed internal operation message. The record contains no provider error text or wrapped error details. Cancellation responses and admission timeouts do not produce this record. Error records go to PostHog error tracking.

Exceptions use the valid request distinct ID when their log context has bindings. Other exceptions use `metadata-scrubber-backend`. Exceptions also set `$process_person_profile` to `false` and include a valid `$session_id` when available. This prevents person profiles for backend-only exceptions.

Telemetry delivery is best effort. The SDK queues can drop records when full. Logs retain the existing messages and attributes. This includes client address and User-Agent values in request logs. Exception descriptions can contain response-write error text.

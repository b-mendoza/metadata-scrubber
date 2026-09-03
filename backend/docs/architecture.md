# Current backend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

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
| `lint/nohiddentestsignal` | `lint/nohiddentestsignal` provides a golangci-lint module linter. The linter reports test skips and `time.Sleep` calls in Go test files. |
| `lint/noemptyinterface` | `lint/noemptyinterface` provides a golangci-lint module linter. The linter reports `any`, literal empty interfaces, and named types or aliases that resolve to empty interfaces in application code. |
| `lint/plugin` | `lint/plugin` registers both analyzers with the golangci-lint Module Plugin System. |

## HTTP API

The server registers these routes:

- `GET /api/health`
- `GET /api/files/config`
- `POST /api/uploads`
- `POST /api/files/dry-run`
- `POST /api/files/scrub`
- `POST /api/files/download-grant`
- `POST /api/files/delete`

The config route returns the backend-owned maximum file size of `10_485_760` bytes. The workflow POST routes accept small JSON contracts, not file bytes.

The download-grant route checks one exact sanitized revision. It returns a fresh 15-minute grant and a UTC RFC 3339 whole-second expiry. It does not download the source or process PDF bytes.

The delete route removes the source and all sanitized revisions for one file. The R2 adapter lists every sanitized-prefix page and deletes each page as one batch. It checks the provider delete result for each page. It then verifies that the source and sanitized prefix are empty. The operation is idempotent. A verified remaining object produces a `409 Conflict` response. Only verified deletion returns `{ "status": "deleted" }`.

## Runtime

- `main.go` configures JSON slog logging. It validates the service configuration and the Cloudflare R2 connection configuration. It creates one long-lived R2 adapter from the validated configuration without contacting R2. It passes the adapter into server construction.
- Server construction creates one handler and one buffered admission channel with a fixed capacity of two. It does not register the superseded multipart endpoint.
- Server construction uses request bindings to inject the validated configuration and the provider-neutral `storage.Storage` interface before routing. Handlers do not construct provider clients or receive AWS SDK types.
- Dry-run acquires the shared permit before source download. It holds the permit through the intake check and PDF inspection.
- Scrub checks that the source exists before it checks the sanitized revision cache. A missing source returns `404 Not Found`. A source-check failure stops later storage and PDF work.
- Scrub acquires the shared permit before source download on a cache miss. It holds the permit through the intake check and PDF cleaning. It releases the permit before sanitized upload. An exact-revision cache hit does not acquire the permit or download the source.
- If a request cannot acquire a permit within two seconds, the server returns `503 Service Unavailable`. Each rejection gets a new whole-second `Retry-After` value. The value uses a two-second base plus random jitter of zero, one, or two seconds. A random-source failure uses two seconds. The value has a one-second minimum.
- If the client cancels while the request waits, the server returns `408 Request Timeout`.
- Dry-run returns the source's canonical unquoted ETag. The ETag grammar is exactly 32 lower-case hexadecimal characters. Scrub binds the reviewed source revision to both the conditional source read and the immutable sanitized object key.
- The server applies a read-header timeout. It performs a graceful shutdown on SIGINT or SIGTERM.
- `.golangci.yml` and `.custom-gcl.yml` contain the lint configuration. The `go` directive in `go.mod` pins the required Go version.

# Current backend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Internal package layout

| Package | Responsibility |
| --- | --- |
| `scrub` | `scrub` parses and validates PDF bytes. It inspects metadata and removes supported metadata. |
| `sniff` | `sniff` applies the strict offset-zero `%PDF-` byte policy to select PDF intake candidates. This check does not establish structural validity. |
| `handler` | `handler` provides HTTP handlers for direct upload grants. It handles dry-run metadata inspection and revision-bound scrubbing. It applies strict JSON validation. It parses storage keys. It logs pipeline activity. It returns success JSON responses. |
| `httpx` | `httpx` provides HTTP helpers that handlers share. The helpers handle CORS and safe request logging. The helpers return error responses. The `httpx/header` and `httpx/mediatype` subpackages handle headers and media types. |
| `bindings` | `bindings` provides middleware that attaches configuration and storage dependencies to each request context. |
| `config` | `config` reads service and Cloudflare R2 connection configuration from the environment. It validates the configuration before startup. |
| `storage` | `storage` defines the private PDF storage contract. It includes a synchronized in-memory fake and a Cloudflare R2 adapter. Upload grants bind the expected size. Callers receive different results for a missing object and a revision conflict when they read a source. Production R2 requests have an overall HTTP timeout. |

## Tooling layout

| Package | Responsibility |
| --- | --- |
| `lint/nohiddentestsignal` | `lint/nohiddentestsignal` provides a golangci-lint module linter. The linter reports test skips and `time.Sleep` calls in Go test files. |
| `lint/noemptyinterface` | `lint/noemptyinterface` provides a golangci-lint module linter. The linter reports uses of `any` and `interface{}`, plus names that refer to empty interfaces. |
| `lint/plugin` | `lint/plugin` registers both analyzers with the golangci-lint Module Plugin System. |

## Runtime

- `main.go` configures JSON slog logging. It validates the service configuration and the Cloudflare R2 connection configuration. It creates one long-lived R2 adapter from the validated configuration without contacting R2. It passes the adapter into server construction.
- Server construction creates one handler and one buffered admission channel with a non-configurable capacity of two. It registers `POST /api/uploads`, `POST /api/files/dry-run`, `POST /api/files/scrub`, and the health route. It does not register the superseded multipart endpoint.
- Server construction uses request bindings to inject the validated configuration and the provider-neutral `storage.Storage` interface before routing. Handlers do not construct provider clients or receive AWS SDK types.
- The dry-run handler acquires the shared permit before source download. It holds the permit through offset-zero sniffing and PDF inspection. The scrub handler acquires the shared permit before source download on a cache miss. It holds the permit through offset-zero sniffing and PDF cleaning. The scrub handler releases its permit before sanitized upload. For an exact-revision sanitized cache hit, the scrub handler does not acquire the shared permit. The scrub handler creates a new download grant. The cache-hit request does not read or write the source.
- If the server cannot acquire a permit for a request within two seconds, it returns `503 Service Unavailable`. The response includes a `Retry-After: 2` header. Clients can depend on this `503 Service Unavailable` response as part of the client-observable API contract. If the client cancels while the request waits, the server returns `408 Request Timeout`.
- Dry-run returns the source's canonical ETag. Scrub looks up the sanitized object under the exact revision key. On a miss, scrub uses a conditional read for the reviewed source revision and cleans the source. It stores the sanitized object under that key and presigns the sanitized object.
- The server applies a read-header timeout. It performs a graceful shutdown on SIGINT/SIGTERM.
- `.golangci.yml` and `.custom-gcl.yml` contain the lint configuration. The `go` directive in `go.mod` pins the required Go version.

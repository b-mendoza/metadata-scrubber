# Backend Architecture (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Internal package layout

| Package | Responsibility |
| --- | --- |
| `scrub` | Parses and validates PDF bytes, inspects their metadata, and removes supported metadata. |
| `sniff` | Applies the strict offset-zero `%PDF-` byte policy for PDF intake candidacy without establishing structural validity. |
| `handler` | HTTP handlers for direct upload grants, dry-run metadata inspection, revision-bound scrubbing, strict JSON validation, storage-key parsing, and pipeline logging. |
| `httpx` | HTTP helpers shared across handlers (CORS, safe request logging, responses), with `httpx/header` and `httpx/mediatype` subpackages for header and media-type handling. |
| `bindings` | Middleware that attaches configuration and storage dependencies to each request context. |
| `config` | Environment-driven service and Cloudflare R2 connection configuration, validated before startup. |
| `storage` | Private PDF storage contract with a synchronized in-memory fake and Cloudflare R2 adapter; upload grants bind the expected size, source reads distinguish missing objects from revision conflicts, and production R2 requests have an overall HTTP timeout. |

## Runtime

- main.go configures JSON slog logging, validates the complete environment, constructs one long-lived R2 adapter from that validated configuration without contacting R2, and passes it into server construction.
- Server construction creates one handler and one non-configurable buffered admission channel with capacity two, then registers `POST /api/uploads`, `POST /api/files/dry-run`, and `POST /api/files/scrub` alongside the health route. The superseded multipart endpoint is not registered.
- Server construction injects both the validated configuration and the provider-neutral `storage.Storage` interface through request bindings before routing. Handlers do not construct provider clients or receive AWS SDK types.
- Dry-run requests and scrub cache misses acquire the shared permit before source download and hold it through offset-zero sniffing and PDF inspection or cleaning. Scrub releases its permit before sanitized upload. Exact-revision sanitized cache hits stay outside admission and mint a fresh download grant without re-reading or rewriting the source.
- A request that cannot acquire a permit within the two-second admission wait receives `503 Service Unavailable` with a `Retry-After: 2` header; a request whose client cancels while it waits receives `408 Request Timeout`. This saturation response is part of the client-observable API contract.
- Dry-run returns the source's canonical ETag. Scrub first looks up the sanitized object under the exact revision key; on a miss, it conditionally reads the reviewed source revision, cleans and stores the sanitized object under that key, and presigns it.
- The server applies a read-header timeout and shuts down gracefully on SIGINT/SIGTERM.
- The linter configuration lives in `.golangci.yml`; the required Go version is pinned by the `go` directive in `go.mod`.

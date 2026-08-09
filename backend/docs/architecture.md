# Backend Architecture (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Package layout

The backend's internal packages are:

| Package | Responsibility |
| --- | --- |
| `scrub` | Inspects and removes metadata from PDF bytes. |
| `handler` | HTTP handlers for the service's endpoints. |
| `httpx` | HTTP helpers shared across handlers (CORS, logging, media types, responses). |
| `bindings` | Middleware that attaches the validated config and provider-neutral storage boundary to every request context; no handler reads them yet. |
| `config` | Environment-driven service and Cloudflare R2 connection configuration, validated before startup. |
| `storage` | Provider-neutral private PDF storage contract, synchronized in-memory fake, and Cloudflare R2 adapter for presigned operations, source revision reads, exact sanitized-revision lookup, and sanitized uploads. |

## Runtime

- main.go configures JSON slog logging, validates the complete environment, constructs one long-lived R2 adapter from that validated configuration without contacting R2, and passes it into server construction.
- Server construction injects both the validated configuration and the provider-neutral `storage.Storage` interface through request bindings before routing. Handlers do not construct provider clients or receive AWS SDK types.
- The server applies a read-header timeout and shuts down gracefully on SIGINT/SIGTERM.
- The linter configuration lives in `.golangci.yml`; the required Go version is pinned by the `go` directive in `go.mod`.

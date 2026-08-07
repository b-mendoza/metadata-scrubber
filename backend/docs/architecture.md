# Backend Architecture (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Package layout

The backend's internal packages are:

| Package | Responsibility |
| --- | --- |
| `scrub` | Inspects and removes metadata from PDF bytes. |
| `handler` | HTTP handlers for the service's endpoints. |
| `httpx` | HTTP helpers shared across handlers (CORS, logging, media types, responses). |
| `bindings` | Middleware that attaches the validated config to every request context; no handler reads it yet. |
| `config` | Environment-driven service and Cloudflare R2 connection configuration, validated before startup. |

## Runtime

- main.go configures JSON slog logging, validates the complete environment before server construction, applies a read-header timeout, and shuts down gracefully on SIGINT/SIGTERM.
- The linter configuration lives in `.golangci.yml`; the required Go version is pinned by the `go` directive in `go.mod`.

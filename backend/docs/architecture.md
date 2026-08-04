# Backend Architecture (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Package layout

Application code lives under `internal/`:

| Package | Responsibility |
| --- | --- |
| `scrub` | Removes metadata from uploaded file bytes. |
| `handler` | HTTP handlers for the service's endpoints. |
| `httpx` | HTTP helpers shared across handlers (CORS, logging, media types, responses). |
| `bindings` | Middleware that attaches the validated config to every request context; no handler reads it yet. |
| `config` | Environment-driven service configuration (e.g. `PORT`). |

## Runtime

- `main.go` wires the packages together: JSON structured logging via `slog`, read-header timeout, and graceful shutdown on SIGINT/SIGTERM.
- The linter configuration lives in `.golangci.yml`; the required Go version is pinned by the `go` directive in `go.mod`.

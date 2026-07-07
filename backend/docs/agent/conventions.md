# Conventions

## Package layout

Application code lives under `internal/`:

| Package | Responsibility |
| --- | --- |
| `scrub` | Removes metadata from uploaded file bytes. |
| `handler` | HTTP handlers for the service's endpoints. |
| `httpx` | HTTP helpers shared across handlers. |
| `bindings` | Request-scoped values attached to the context. |
| `config` | Environment-driven service configuration. |

## Style authority

`.golangci.yml` is the enforced source of truth for style. Prefer fixing a lint finding over suppressing it; reach for an inline `//nolint` only when the rule is genuinely wrong for the case, and say why.

Naming conventions and the general working posture live in the [root Agent Guide](../../../AGENTS.md) and apply here.

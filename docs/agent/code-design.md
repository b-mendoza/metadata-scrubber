# Code design

Principles that apply across services and languages. Framework-specific mechanisms (how a given service implements these) live in that service's `docs/agent/`.

## Validate at the boundary

- Parse external data where it enters the system, rather than passing raw strings deeper in.
- Prefer structured return types that make invalid states unrepresentable over primitive types a caller can misuse. For example, return a parsed URL value rather than a raw string.

## Dependency injection

- Read injected dependencies (database, configuration, storage) from the request-scoped application bindings the service provides. Do not reach for them as module-level globals.
- Both services carry a request-scoped "bindings" concept; the mechanism differs (each service's short-lived architecture reference under its `docs/` directory describes its implementation), but the rule is the same — get dependencies from the bindings, not from globals.

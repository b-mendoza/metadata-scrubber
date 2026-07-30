# Code design

Principles that apply across services and languages. Framework-specific mechanisms (how a given service implements these) live in that service's `docs/agent/`.

## Contracts at the boundaries

Every entry point into a service — an HTTP endpoint, a server function, a CLI command — has a contract: the shape of data it accepts and the shape it promises to return. Make that contract explicit in code and enforce it at the boundary, so the system itself is the first thing to detect a violation. If a client, a dashboard, or someone poking the API with a manual tool notices a broken contract before the system does, that is a defect in the system, not just in the data.

- **Parse inputs where they enter.** Define a schema or typed request model per entry point and validate against it before any logic runs. Reject invalid input at the boundary with a clear error rather than passing raw data deeper in.
- **Declare outputs as explicit response models.** Every entry point returns a declared DTO or schema-backed type, never an ad-hoc map or untyped blob assembled inline. Where the type system can guarantee the shape end to end, that declaration is the enforcement; add runtime validation of outputs only where the type system cannot see — data assembled dynamically, or passed through from a database or third party.
- **Distrust data from systems you do not control.** When consuming another system's response — including our own backend from the frontend — parse it against a schema instead of casting or assuming. A type annotation on an incoming response is a claim, not a guarantee.
- **Fail loudly, never quietly.** A contract violation is an error: surface it immediately with an error response and an error-level log, and never coerce, default, or silently drop invalid data to keep a request limping along. Loud failure at the boundary is what makes a broken contract visible and actionable without relying on external tooling or client reports.
- **Prefer types over repeated checks.** Structured types that make invalid states unrepresentable beat scattering runtime checks through every layer. For example, return a parsed URL value rather than a raw string. Validate once at the boundary, pass parsed values inward, and do not re-validate the same data downstream.

## Dependency injection

- Read injected dependencies (database, configuration, storage) from the request-scoped application bindings the service provides. Do not reach for them as module-level globals.
- Both services carry a request-scoped "bindings" concept; the mechanism differs (each service's short-lived architecture reference under its `docs/` directory describes its implementation), but the rule is the same — get dependencies from the bindings, not from globals.

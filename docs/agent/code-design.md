# Code design

Principles that apply across services and languages. Framework-specific mechanisms (how a given service implements these) live in that service's own guides.

## Contracts at the boundaries

Every entry point into a service — an HTTP endpoint, a server function, a CLI command — has a contract: the shape of data it accepts and the shape it promises to return. Make that contract explicit in code and enforce it at the boundary, so the system itself is the first thing to detect a violation. If a client, a dashboard, or someone poking the API with a manual tool notices a broken contract before the system does, that is a defect in the system, not just in the data.

- **Parse, don't assume.** Any data crossing into the system — request input, a third-party response, our own backend's response consumed by the frontend — is validated against an explicit schema or typed model at the crossing point, before any logic runs. A type annotation on incoming data is a claim, not a guarantee; reject what fails to parse with a clear error rather than passing it deeper in.
- **Declare outputs as explicit response models.** Every entry point returns a declared DTO or schema-backed type, never an ad-hoc blob assembled inline. Static types are the enforcement wherever they reach; add runtime validation only where they cannot see — dynamically assembled data, or pass-throughs from a database or third party.
- **Fail loudly, never quietly.** A contract violation is an error surfaced immediately — error response, error-level log — never coerced, defaulted, or silently dropped to keep a request limping along. Loud failure at the boundary is what makes a broken contract visible without external tooling or client reports.
- **Types carry the guarantee inward.** Prefer structured types that make invalid states unrepresentable — a parsed URL value over a raw string. Validate once at the boundary and pass parsed values on; internal code relies on the invariants established there instead of re-checking the same data at every layer.

## Comments

- Comment to explain *why* — a constraint, a trade-off, a non-obvious invariant the code cannot express — never to narrate *what* the code does or that it changed. Comments describing the change itself ("removed X", "now uses Y instead") belong in the commit message, not the source.

## Dependency injection

- Read injected dependencies (database, configuration, storage) from the request-scoped application bindings the service provides. Do not reach for them as module-level globals.
- Both services carry a request-scoped "bindings" concept; the mechanism differs (each service's short-lived architecture reference under its `docs/` directory describes its implementation), but the rule is the same — get dependencies from the bindings, not from globals.

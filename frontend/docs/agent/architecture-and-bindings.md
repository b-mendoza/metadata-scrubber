# Server Architecture And Bindings

General boundary-validation and dependency-injection principles live in the [root code design guide](../../../docs/agent/code-design.md) and apply here. This file covers the framework-specific mechanisms.

## Choosing A Server Boundary

- Use server functions for small, direct, single-purpose operations.
- Use tRPC procedures for database queries, business logic, and multi-step operations.

## Server Functions

- Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.

## Application Bindings

- Request-scoped dependency injection is implemented with `AsyncLocalStorage`.
- Server-side code calls `getApplicationBindings()`, which returns `{ db, env, storage }`.

## Boundary Types

- Concrete example of the root "structured return types" rule: return a `URL` object from `getSignedReadUrl()` rather than a raw `string`, so callers cannot misuse it.

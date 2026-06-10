# Server Architecture And Bindings

## Choosing A Server Boundary

- Use server functions for small, direct, single-purpose operations.
- Use tRPC procedures for database queries, business logic, and multi-step operations.

## Server Functions

- Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.

## Application Bindings

- Request-scoped dependency injection is implemented with `AsyncLocalStorage`.
- Server-side code must call `getApplicationBindings()`, which returns `{ db, env, storage }`.
- Do not import these dependencies as globals.

## Boundary Types

- Parse external data at the boundary instead of passing raw strings deeper into the system.
- Prefer structured return types when they make invalid states unrepresentable.
- Example: return a `URL` object from `getSignedReadUrl()` rather than a raw `string`.

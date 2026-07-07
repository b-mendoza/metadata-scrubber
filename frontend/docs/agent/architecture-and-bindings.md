# Server Architecture And Bindings

General boundary-validation and dependency-injection principles live in the [root code design guide](../../../docs/agent/code-design.md) and apply here. This file covers the framework-specific mechanisms.

## Framework

- The app is built on [TanStack Start](https://tanstack.com/start) (`@tanstack/react-start`) with file-based routes under `src/routes/` and tRPC mounted at `src/routes/api/trpc.$.ts`.

## Choosing A Server Boundary

- Use route server handlers or server functions for small, direct, single-purpose operations (see `src/routes/api/upload.ts`).
- Use tRPC procedures for database queries, business logic, and multi-step operations. Routers live in `src/shared/libs/trpc/` and per-domain files such as `src/domains/products/products-router.mod.server.ts`.

## Server Functions

- Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.

## Application Bindings

- Request-scoped dependency injection is implemented with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server-side code calls `getApplicationBindings()`. It currently returns `{ env }` — the parsed, Zod-validated environment. A `db` binding is scaffolded but commented out until the database client is wired in.
- The middleware parses `process.env` against `envSchema` on every request, so environment access downstream is always validated.

## Boundary Types

- Concrete examples of the root boundary rules in this codebase: the upload route parses the raw form-data file with a Zod schema before touching it, and the bindings middleware parses `process.env` with `envSchema` instead of passing raw strings deeper in.

# Frontend Architecture (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Framework

- Built on [TanStack Start](https://tanstack.com/start) (`@tanstack/react-start`) with file-based routes under `src/routes/` and tRPC mounted at `src/routes/api/trpc.$.ts`.

## Source layout

- `src/domains/<domain>/` — feature code grouped by domain (`wizard`, `products`), each owning its components, constants, and routers.
- `src/shared/` — cross-domain code: `config`, `constants`, `db`, `libs` (tRPC), `middlewares`, `utils`.
- `src/routes/` — TanStack Router file-based routes; API routes under `src/routes/api/`.
- `src/tests/` — test setup and shared render helpers (`src/tests/utils/renderers/`).

## Server boundaries

- Route server handlers / server functions handle small, direct, single-purpose operations (see `src/routes/api/upload.ts`). Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.
- tRPC procedures handle database queries, business logic, and multi-step operations. Routers live in `src/shared/libs/trpc/` and per-domain files such as `src/domains/products/products-router.mod.server.ts`.

## Application bindings

- Request-scoped dependency injection is implemented with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server-side code calls `getApplicationBindings()`. It currently returns `{ env }` — the parsed, Zod-validated environment. A `db` binding is scaffolded but commented out until the database client is wired in.
- The middleware parses `process.env` against `envSchema` on every request, so environment access downstream is always validated.

## Database

- PostgreSQL via Drizzle ORM; config in `drizzle.config.ts`, migration commands in [commands](./commands.md).
- Schema is defined in `src/shared/db/db.schema.server.ts`. It currently defines a single `users` table.
- The database client is **not wired into the application bindings yet** (see above).

## File uploads

- `src/routes/api/upload.ts` accepts a `POST` with form data, validates the file with a Zod schema against `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`, and returns file metadata plus a generated `storageKey`.
- **No storage backend is implemented yet.** The route does not persist the file. S3 SDK dependencies and `@uppy/react` are installed in anticipation, but there is no storage module under `src/`.

## Testing status

- The suite currently has **zero test files**. `passWithNoTests: true` is set in `vitest.config.ts` so `pnpm run test` remains a valid commit gate; remove it once tests land.
- Highest-value first targets, per the root risk-based coverage rule: upload validation branches in `src/routes/api/upload.ts`, environment parsing and the bindings invariant in the application-bindings middleware, and wizard constants wiring (import the production constants in assertions).

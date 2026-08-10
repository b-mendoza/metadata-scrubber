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
- tRPC procedures handle database queries, business logic, and multi-step operations. The root router registers the `products` and `wizard` domain routers.
- The `wizard` router is server-only. It sends small JSON requests to the backend through the validated `BACKEND_URL` binding. It passes the request `AbortSignal` to each backend request.

## Application bindings

- Request-scoped dependency injection is implemented with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server-side code calls `getApplicationBindings()`. It currently returns `{ env }` — the parsed, Effect Schema-validated environment. A `db` binding is scaffolded but commented out until the database client is wired in.
- The middleware decodes `process.env` against `envSchema` (an Effect Schema; the decode Effect runs via `Effect.runPromise` at the middleware boundary) on every request, so environment access downstream is always validated.

## Validation

- Server-side boundaries validate with Effect Schema. Client-side code validates with Zod. The rationale for this split lives in the [validation-libraries convention](./agent/code-conventions.md).
- The wizard router rejects unknown input and response keys. It maps approved backend statuses to stable tRPC codes and frontend-owned public messages. It discards backend error text.

## Database

- PostgreSQL via Drizzle ORM; config in `drizzle.config.ts`, migration commands in [commands](./commands.md).
- Schema is defined in `src/shared/db/db.schema.server.ts`. It currently defines a single `users` table.
- The database client is **not wired into the application bindings yet** (see above).

## File uploads

- `src/routes/api/upload.ts` accepts a `POST` with form data, validates the file with an Effect Schema (`Schema.File` plus size/MIME filters) against `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`, and returns file metadata plus a generated `storageKey`. The handler body is an Effect program executed with `Effect.runPromise` at the route boundary.
- **No storage backend is implemented in this service yet.** The route does not persist the file. S3 SDK dependencies and `@uppy/react` are installed in anticipation, but there is no storage module under `src/`. The Go backend already owns storage and scrubbing (upload grants, Cloudflare R2, presigned downloads); read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you add storage code here.

## Testing status

- The suite has caller-level Vitest tests for the server-only wizard router. The tests cover requests, runtime validation, safe error mapping, cancellation signals, and duplicate scrub success.
- Vitest requires at least one test file. The configuration does not use `passWithNoTests`.
- Other high-value targets include upload route validation, environment parsing, and the application-bindings invariant.

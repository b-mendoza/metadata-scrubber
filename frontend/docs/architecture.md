# Current frontend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`. Each domain contains the code for its feature area. This code can include components, constants, or routers.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `database`, `libs` for tRPC and ky, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.

## Server boundaries

- Use route server handlers and server functions for small operations. Keep each operation direct and single-purpose. See `src/routes/api/upload.ts`. Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.
- Use tRPC procedures for database queries and business logic. Use tRPC procedures for multi-step operations. Developers place routers in `src/shared/libs/trpc/` and in domain files such as `src/domains/products/products-router.mod.server.ts`.

## Application bindings

- Developers implement request-scoped dependency injection with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server code calls `getApplicationBindings()`. The function returns `{ env, httpClient }`.
- The `env` binding contains the environment that the middleware validated.
- The `httpClient` binding is the request-scoped Ky client.
- The bindings create Ky with `BACKEND_URL` as `baseUrl`.
- Developers added the `db` binding code but commented it out. Developers keep the `db` binding code commented out until they connect the database client.
- On each request, the middleware calls `environmentSchema.parse(process.env)`. `environmentSchema` is a Zod object schema. A validation error rejects the async middleware request. The middleware provides the validated bindings to downstream code through `getApplicationBindings()`.

## Backend HTTP

- The `getMessage` tRPC procedure is the frontend's only backend call. It uses ky.
- The procedure reads `httpClient` from the request-scoped application bindings.
- The procedure requests relative `/api/health`.
- The procedure passes the tRPC request signal.
- The procedure passes a Zod schema to ky's `.json(schema)` method. The schema validates each successful JSON body.
- The procedure maps every outbound failure to one safe `BAD_GATEWAY` tRPC error. This mapping also covers an invalid successful JSON body.
- The shared Ky client owns the transport policy.
- Each attempt has a 3000 ms timeout.
- The total timeout is 5000 ms.
- The client permits one retry.
- The client caps the retry delay and the `Retry-After` value at 250 ms.
- The client does not retry after a timeout.

## Validation

Use Zod for all validation logic in every environment.

## Database

- Developers use PostgreSQL through Drizzle ORM. They keep Drizzle config in `drizzle.config.ts`. See the migration commands in the [commands reference](./commands.md).
- Developers define the schema in `src/shared/database/database.schema.server.ts`. The current schema defines one `users` table.
- Application bindings do not contain the database client.

## File uploads

- `src/routes/api/upload.ts` exports `postUpload`. The route uses this function as its `POST` handler.
- The handler wraps `context.request.formData()` in `ResultAsync.fromThrowable()`.
- The error mapper converts a form-data read failure to an `Error`. It preserves the original failure in `cause`.
- The route boundary consumes the `Result`. It throws the mapped `Error` when the form-data read fails.
- The handler validates the `file` value with a Zod file schema after the form-data read succeeds.
- The schema uses `z.file()`, `.max()`, and `.mime()`. The size limit comes from `MAX_FILE_SIZE_BYTES`. The MIME type list comes from `UPLOADABLE_MIME_TYPES`.
- An invalid upload value still throws a `ZodError`.
- The handler returns file metadata and a generated `storageKey`.
- This service has no storage backend. The route does not persist the file.
- The project includes S3 SDK dependencies and `@uppy/react` for planned storage work. No storage module exists under `src/`.
- The Go backend handles upload grants. The Go backend handles file storage and metadata scrubbing. It uses Cloudflare R2 for storage. It handles presigned downloads. Read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you add storage code to the frontend.

## Testing status

- The suite checks that a rejected backend health request becomes a safe `BAD_GATEWAY` error.
- The suite checks that a reachable health payload returns that status.
- The suite checks that a hung fetch rejects as a Ky timeout at 3000 ms and that `fetch` runs once.
- The suite checks that a 502 response rejects as an HTTP error and that `fetch` runs twice.
- Follow the root risk-based coverage rule. Add these tests in this priority order:
  1. Test that the upload validation uses `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`. Import those production constants in assertions.
  2. Test environment parsing and the bindings invariant in the application-bindings middleware.

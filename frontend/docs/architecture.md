# Current frontend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`. Each domain contains the code for its feature area. This code can include components, constants, or routers.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `database`, `libs` for tRPC, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.

## Server boundaries

- Use route server handlers and server functions for small operations. Keep each operation direct and single-purpose. See `src/routes/api/upload.ts`. Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.
- Use tRPC procedures for database queries and business logic. Use tRPC procedures for multi-step operations. Developers place routers in `src/shared/libs/trpc/` and in domain files such as `src/domains/products/products-router.mod.server.ts`.

## Application bindings

- Developers implement request-scoped dependency injection with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server code calls `getApplicationBindings()`. The function returns `{ env }` in the current code. The `env` binding contains the environment that the middleware validated.
- Developers added the `db` binding code but commented it out. Developers keep the `db` binding code commented out until they connect the database client.
- On each request, the middleware calls `environmentSchema.parse(process.env)`. `environmentSchema` is a Zod object schema. A validation error rejects the async middleware request. The middleware provides the validated `env` binding to downstream code through `getApplicationBindings()`.

## Backend HTTP

- The `getMessage` tRPC procedure is the frontend's only backend call. It uses ky.
- The procedure reads `BACKEND_URL` from the request-scoped application bindings. It constructs the fixed `/api/health` path from this base URL.
- The procedure passes a Zod schema to ky's `.json(schema)` method. The schema validates each successful JSON body.
- The procedure maps every outbound failure to one safe `BAD_GATEWAY` tRPC error. This mapping also covers an invalid successful JSON body.
- Each attempt has a 3-second ky timeout. The ky total timeout is 5 seconds.
- The call permits one retry. It caps the retry delay and the `Retry-After` value at 250 ms.
- The retry policy enables jitter. It disables retries after a timeout.
- The procedure creates a 5-second timeout signal for each call.
- The procedure combines the timeout signal with the tRPC cancellation signal when that signal exists.
- The combined signal bounds the HTTP request and the response body read.
- The request policy stays at the call site because the frontend has one backend call.

## Validation

Use Zod for all validation logic in every environment.

## Database

- Developers use PostgreSQL through Drizzle ORM. They keep Drizzle config in `drizzle.config.ts`. See the migration commands in the [commands reference](./commands.md).
- Developers define the schema in `src/shared/database/database.schema.server.ts`. The current schema defines one `users` table.
- Application bindings do not contain the database client.

## File uploads

- The `POST` handler in `src/routes/api/upload.ts` accepts form data. It validates the form value with a Zod file schema. The schema uses `z.file()`, `.max()`, and `.mime()`. The size limit comes from `MAX_FILE_SIZE_BYTES`. The MIME type list comes from `UPLOADABLE_MIME_TYPES`. Both constants are in `src/domains/wizard/constants/wizard.mod.ts`.
- The handler returns file metadata and a generated `storageKey`. The handler uses direct async control flow with `async` and `await`.
- This service has no storage backend. The route does not persist the file.
- The project includes S3 SDK dependencies and `@uppy/react` for planned storage work. No storage module exists under `src/`.
- The Go backend handles upload grants. The Go backend handles file storage and metadata scrubbing. It uses Cloudflare R2 for storage. It handles presigned downloads. Read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you add storage code to the frontend.

## Testing status

- The suite checks that an HTTP 400 response becomes a safe `BAD_GATEWAY` error when its body matches the health schema.
- The suite checks that an invalid successful health payload becomes the same safe error.
- The suite checks the exact backend health URL and ky policy wiring.
- The suite checks that `getProducts` waits for `PRODUCTS_RESPONSE_DELAY_MS`.
- Follow the root risk-based coverage rule. Add these tests in this priority order:
  1. Test the upload validation branches in `src/routes/api/upload.ts`.
  2. Test environment parsing and the bindings invariant in the application-bindings middleware.
  3. Test that the upload validation in `src/routes/api/upload.ts` uses `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`. Import those production constants in assertions.

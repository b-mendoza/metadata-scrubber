# Current frontend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`. Each domain contains its components, constants, and routers.
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

## Validation

Use Effect Schema at server boundaries. Use Zod in client code. Read the [validation-libraries convention](./agent/code-conventions.md) for the reason for this split.

## Database

- Developers use PostgreSQL through Drizzle ORM. They keep Drizzle config in `drizzle.config.ts`. See the migration commands in the [commands reference](./commands.md).
- Developers define the schema in `src/shared/database/database.schema.server.ts`. The current schema defines one `users` table.
- Application bindings do not contain the database client.

## File uploads

- The `POST` handler in `src/routes/api/upload.ts` accepts form data. It validates the form value with a Zod file schema. The schema uses `z.file()`, `.max()`, and `.mime()`. The size limit comes from `MAX_FILE_SIZE_BYTES`. The MIME type list comes from `UPLOADABLE_MIME_TYPES`. Both constants are in `src/domains/wizard/constants/wizard.mod.ts`.
- The handler returns file metadata and a generated `storageKey`. The handler body is an Effect program. `Effect.runPromise` runs the program at the route boundary.
- This service has no storage backend. The route does not persist the file.
- The project includes S3 SDK dependencies and `@uppy/react` for planned storage work. No storage module exists under `src/`.
- The Go backend handles upload grants. The Go backend handles file storage and metadata scrubbing. It uses Cloudflare R2 for storage. It handles presigned downloads. Read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you add storage code to the frontend.

## Testing status

- The suite has zero test files. `vitest.config.ts` sets `passWithNoTests: true`, so `pnpm run test` remains a required check before commits. Remove this setting after developers add the first test files.
- Follow the root risk-based coverage rule. Add these tests in this priority order:
  1. Test the upload validation branches in `src/routes/api/upload.ts`.
  2. Test environment parsing and the bindings invariant in the application-bindings middleware.
  3. Test that the upload validation in `src/routes/api/upload.ts` uses `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`. Import those production constants in assertions.

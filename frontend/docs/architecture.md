# Current frontend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`.
- The wizard domain contains the typed file-workflow tRPC router and its tests.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `database`, `libs` for tRPC and Ky, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.

## Server boundaries

- Use route server handlers and server functions for small operations. Keep each operation direct and single-purpose. See `src/routes/api/upload.ts`. Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.
- Use tRPC procedures for database queries, business logic, and the small-JSON backend workflow.
- The root tRPC router registers the `products` and `wizard` routers.
- The wizard router provides these procedures:
  - `getWorkflowConfig`
  - `createUpload`
  - `dryRun`
  - `scrubFile`
  - `refreshDownloadGrant`
  - `confirmDelete`
- Each procedure has an explicit Zod input schema when it accepts input. Each procedure validates its backend success body with Zod.
- The tRPC workflow sends storage keys, canonical ETags, file names, and file sizes. It never sends file bytes.

## Application bindings

- Developers implement request-scoped dependency injection with `AsyncLocalStorage` in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`.
- Server code calls `getApplicationBindings()`. The function returns `{ httpClient, workflowHttpClient }`.
- The `httpClient` binding is the request-scoped health-check Ky client.
- The `workflowHttpClient` binding is the request-scoped file-workflow Ky client.
- Both clients use the validated `BACKEND_URL` as `baseUrl`.
- Developers added the `db` binding code but commented it out. Keep the code commented out until the application connects the database client.
- On each request, the middleware calls `environmentSchema.parse(process.env)`. A validation error rejects the middleware request. The middleware provides the validated bindings to downstream code through `getApplicationBindings()`.

## Backend HTTP

### Health transport

- The `getMessage` procedure reads `httpClient` from the request-scoped bindings.
- It requests relative `/api/health` and passes the tRPC request signal.
- It validates the success body with Zod.
- It maps every outbound failure to one safe `BAD_GATEWAY` tRPC error.
- Each attempt has a 3000 ms timeout. The total timeout is 5000 ms.
- The client permits one retry. It caps retry delay and `Retry-After` at 250 ms. It does not retry a timeout.

### Workflow transport

- Each wizard procedure reads `workflowHttpClient` from the request-scoped bindings.
- Each procedure calls one relative backend route and passes the tRPC request signal.
- `getWorkflowConfig`, `createUpload`, `refreshDownloadGrant`, and `confirmDelete` use a 10-second attempt timeout and a 10-second total timeout. They do not retry.
- `dryRun` uses a 90-second attempt timeout and a 90-second total timeout.
- `scrubFile` uses a 240-second attempt timeout and a 240-second total timeout.
- Dry-run and scrub permit at most two retries. They retry only `POST` responses with status `503` and a positive whole-second `Retry-After` header.
- The workflow client uses the server's `Retry-After` value. It applies no client delay or client jitter. It caps `Retry-After` at 4000 ms. It does not retry timeouts, network failures, other status codes, or invalid header values.
- Backend status `400`, `404`, `408`, `409`, `413`, `415`, `422`, and `503` map to the matching safe tRPC error code.
- A Ky timeout maps to `TIMEOUT`. Invalid backend success JSON and invalid backend error JSON map to `BAD_GATEWAY`. Other upstream failures also map to `BAD_GATEWAY`.
- Public tRPC errors do not include backend error text, provider details, credentials, object keys, request IDs, or presigned URL details.
- Outbound failure handling uses neverthrow. The frontend does not use Effect.

## Validation

Use Zod for all validation logic in every environment.

The workflow schemas enforce these contracts:

- The Go backend owns the maximum source size.
- `getWorkflowConfig` supplies the frontend with a positive runtime `maxFileSizeBytes` value.
- The uploader uses this runtime value for its file-size restriction. The frontend does not own a copy of the limit.
- A storage key contains an `uploads/` prefix and one lower-case UUIDv4 value.
- A canonical ETag contains exactly 32 lower-case hexadecimal characters. It has no quotes or whitespace.
- A file name cannot start or end with whitespace. The schema rejects whitespace instead of changing the file name.
- A download-grant expiry is an RFC 3339 whole-second timestamp.
- Backend success and error objects reject unknown properties.

## Database

- Developers use PostgreSQL through Drizzle ORM. They keep Drizzle config in `drizzle.config.ts`. See the migration commands in the [commands reference](./commands.md).
- Developers define the schema in `src/shared/database/database.schema.server.ts`. The current schema defines one `users` table.
- Application bindings do not contain the database client.

## File uploads

- The typed workflow requests an upload grant through `createUpload`.
- The grant contract contains a storage key and a presigned upload URL. The tRPC call contains no file bytes.
- The Go backend owns private storage, PDF inspection, metadata removal, sanitized revisions, download grants, and confirmed deletion.
- `src/routes/api/upload.ts` still contains the earlier local form-data metadata handler. It does not persist a file. It is not part of the typed backend workflow.
- The project includes S3 SDK dependencies and `@uppy/react`. No frontend storage adapter exists under `src/`.
- Read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you add storage code to the frontend.

## Testing status

- Direct tRPC caller tests cover all six workflow procedures and root-router registration.
- Tests check exact backend methods, paths, and JSON bodies. They check that no contract contains file bytes.
- Tests cover canonical ETag validation, invalid procedure inputs, invalid backend success bodies, safe status mapping, invalid backend error bodies, timeouts, and caller cancellation.
- Router tests cover backend status `413` as the safe tRPC `PAYLOAD_TOO_LARGE` error.
- Workflow transport tests cover exact server-directed delays, the 4000 ms cap, the three-attempt limit, rejected retry conditions, operation timeouts, total-timeout expiry, no-retry operations, and caller abort.
- Health transport tests keep the separate health retry and timeout contract under regression coverage.
- `vitest.config.ts` requires test discovery. It does not permit a successful run with no tests.

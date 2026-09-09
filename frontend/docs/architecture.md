# Current frontend architecture

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`.
- The wizard domain contains the typed file-workflow tRPC router, its wire contracts, browser views, and tests.
- `wizard.mod.tsx` exports `WizardUpload`. `wizard-review.mod.tsx` owns review and scrub. Route files own navigation and terminal outcomes.
- `wizard-result.mod.tsx` owns download grants and confirmed deletion. Both files are under `src/domains/wizard/components/wizard/`.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `database`, `libs` for tRPC and Ky, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.

## Server boundaries

- Use route server handlers and server functions for small operations. Keep each operation direct and single-purpose. See `src/routes/api/trpc.$.ts`. Wrap server-only code with `createServerOnlyFn` from `@tanstack/react-start`.
- Use tRPC procedures for database queries, business logic, and the small-JSON backend workflow.
- The root tRPC router registers the `products` and `wizard` routers.
- The wizard router provides these procedures:
  - `getWorkflowConfig`
  - `createUpload`
  - `dryRun`
  - `scrubFile`
  - `refreshDownloadGrant`
  - `confirmDelete`
- `getWorkflowConfig`, `dryRun`, and `refreshDownloadGrant` are queries. Inspection and grant refresh still send the existing backend POST with typed JSON. The other workflow procedures are mutations.
- Each procedure has an explicit Zod input schema when it accepts input. Each procedure validates its backend success body with Zod.
- The tRPC workflow sends storage keys, canonical ETags, file names, and file sizes. It never sends file bytes.

## App bindings

- Developers implement request-scoped dependency injection with `AsyncLocalStorage` in `src/shared/middlewares/app-bindings/app-bindings.mod.ts`.
- Server code calls `getAppBindings()`. The function returns `{ httpClient, workflowHttpClient }`.
- The `httpClient` binding is the request-scoped health-check Ky client.
- The `workflowHttpClient` binding is the request-scoped file-workflow Ky client.
- Both clients use the validated `BACKEND_URL` as `baseUrl`.
- Developers added the `db` binding code but commented it out. Keep the code commented out until the application connects the database client.
- On each request, the middleware calls `environmentSchema.parse(process.env)`. A validation error rejects the middleware request. The middleware provides the validated bindings to downstream code through `getAppBindings()`.

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
- Dry-run and scrub permit at most two retries for `POST` responses with status `503`. Recognized network errors also retry under Ky's native policy. Timeouts and other response status codes do not retry.
- Ky handles `Retry-After`. The workflow client adds no header parsing, validation, minimum, or cap. An absent or malformed header uses Ky's default delay. Attempt and total timeouts still bound each operation.
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
- App bindings do not contain the database client.

## File uploads

- The Uppy uploader accepts exactly one PDF file. It uses the runtime size limit from `getWorkflowConfig`.
- The uploader calls `createUpload` with the file name and file size. It does not send file bytes in the tRPC call.
- `createUpload` returns a private R2 `storageKey` and a presigned PUT URL.
- The browser sends the PDF bytes directly to private R2 with the presigned URL.
- Uppy stores the backend-generated `storageKey` in file metadata. Only `{ storageKey }` enters the review search after a successful upload.
- No frontend route parses or proxies file bytes.
- The Go backend owns R2 credentials and the file-size limit. The browser does not receive R2 credentials.
- The Go backend also owns PDF inspection, metadata removal, sanitized revisions, download grants, and confirmed deletion.
- Read the service-integration section of the root [architecture reference](../../docs/architecture.md) before you change storage code in the frontend.

## Browser workflow

- `/` accepts no workflow search payload. `/review` requires only `storageKey`. `/result` requires only `storageKey` and `etag`. `/outcome` requires only the fixed `kind` enum.
- Strict Zod schemas reject extra fields and invalid identifiers before file requests. `wizard-identifiers.mod.ts` supplies browser-safe identifier schemas. Invalid search replaces the route with `/`.
- Review and result loaders use `queryClient.query` with `retry: false`, `staleTime: 0`, and `gcTime: 0`. Route reload settings require a current backend check. A cached success cannot replace that check.
- Same-tab refresh restores review or result from validated search. A missing object selects the missing-source outcome. A canceled loader cannot redirect a newer navigation.
- Step completion and restart replace consumed history entries. Search never contains file names, metadata text, presigned URLs, or backend error text.
- Removal of the products domain and its router registration is Task 3 (#307). Full resume-at-the-right-step from a shared link stays in #283.

- The pathless `_wizard.tsx` layout renders the wizard scope and persistent missing-file notice. The index route renders upload. It has no products loader and sends no products request. The products domain and router registration remain in the repository.
- The wizard loads upload settings with automatic retries and focus, reconnect, interval, and mount refetch disabled. A failed request has a deliberate retry control.
- A successful direct PUT starts one inspection. The review uses backend labels, previews, byte sizes, and actions. A UTF-8 byte comparison identifies shortened previews. The ETag binds scrub to the reviewed revision.
- Signed PDFs and PDFs with no supported metadata have terminal states. Conflict requires a new upload. A missing source selects `/outcome?kind=missing-source`. Restart retains the notice. Dismiss or a new review clears it.
- The scope is supported Info, XMP, and custom metadata. The page does not claim to remove all hidden PDF content. It shows the retention notice directly below the scrub action.
- The result uses a direct download link. On result entry, the route loader fetches one grant through the real query options proxy. The component receives its URL and expiry. It makes no mount request. It does not mount a grant query observer or poll processing.
- The result stores the grant URL and authoritative `expiresAt` together. It schedules renewal 30 seconds before expiry. It prevents overlapping calls. It disables an expired link, including while renewal is pending, and checks expiry again before navigation.
- A hidden tab cancels pending renewal and stops its renewal timer. A visible tab renews when expiry is unknown, expired, or within the lead window. Otherwise it restores the timer.
- A failed renewal has no automatic retry. A known unexpired link remains usable only until expiry. A deliberate renewal control permits another attempt. An already-expired response fails. A short-lived grant does not cause an immediate renewal loop.
- A missing scrubbed PDF clears the link and shows a safe notice. It does not repeat scrub.
- A native dialog asks before deletion. Cancel receives initial focus. Cancel and Escape return focus to the opener without a delete request.
- Confirmed deletion immediately clears the link and stops renewal. Late grant responses cannot restore access. Success starts a new upload flow. Failure keeps access cleared and permits another confirmation or a new upload.
- View exit cancels and removes the exact grant query. Generation guards ignore stale operation results. Validated storage keys and ETags can appear in page URLs, history, referrers, and server logs during the object lifetime. The wizard does not save them in browser storage.
- Native status and alert regions announce pending work and safe failures. A new upload receives heading focus after a restart.

## Testing status

- Direct tRPC caller tests cover all six workflow procedures and root-router registration.
- Tests check exact backend methods, paths, and JSON bodies. They check that no contract contains file bytes.
- Tests cover canonical ETag validation, invalid procedure inputs, invalid backend success bodies, safe status mapping, invalid backend error bodies, timeouts, and caller cancellation.
- Router tests cover backend status `413` as the safe tRPC `PAYLOAD_TOO_LARGE` error.
- Uploader tests cover runtime size restrictions, the PDF-only and one-file restrictions, non-multipart PUT signing, direct browser PUT requests, successful metadata handoff, grant failures, PUT failures, and manual retries.
- Uploader tests use the real `@uppy/aws-s3` plugin and a test-local `XMLHttpRequest` fake. They do not call R2.
- Workflow transport tests cover server-directed delays, the three-attempt limit, recognized network-error retries, operation timeouts, total-timeout expiry, no-retry operations, and caller abort.
- Wizard tests cover root wiring, real upload success and failures, review, revision-bound scrub, duplicate guards, and terminal failures. Result tests cover grant expiry, visibility changes, manual renewal, missing objects, deletion outcomes, and stale responses. Accessibility tests cover keyboard controls, dialog focus, fresh mounts, and absent browser-storage identifiers.
- Browser tests use happy-dom and typed operation doubles. They do not prove live storage behavior or screen-reader announcements.
- Health transport tests keep the separate health retry and timeout contract under regression coverage.
- `vitest.config.ts` requires test discovery. It does not permit a successful run with no tests.

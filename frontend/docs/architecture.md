# Current frontend architecture

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Deployment

- Vercel runs this service as a TanStack Start application. Vercel manages the server runtime.
- One instance can serve many requests at the same time.
- Vercel injects the backend's URL as a service binding.
- Vercel limits each request's run time and each instance's memory.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domains include `wizard` and `products`.
- The wizard domain contains the typed file-workflow tRPC router, its wire contracts, and its tests.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `libs` for tRPC and Ky, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.
- Module files use `.mod.ts` or `.mod.tsx`. Server-only modules use `.mod.server.ts`.
- Source tests use `.test.ts` or `.test.tsx` and sit next to the code they test.
- `tsconfig.app.json` maps the `#/` import alias to `src/`.
- The TanStack Router plugin generates `src/routeTree.gen.ts` during development and production builds. The service has no separate route-generation script.

## Server boundaries

- The frontend server proxies the small-JSON workflow to the Go backend through tRPC procedures.
- The `.server` module suffix marks server-only code. Other source modules can enter the client bundle, even when they contain a server callback.
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

## App bindings

- Developers implement request-scoped dependency injection with `AsyncLocalStorage` in `src/shared/middlewares/app-bindings/app-bindings.mod.ts`.
- Server code calls `getAppBindings()`. The function returns `{ httpClient, workflowHttpClient }`.
- The `httpClient` binding is the request-scoped health-check Ky client.
- The `workflowHttpClient` binding is the request-scoped file-workflow Ky client.
- Both clients use the validated `BACKEND_URL` as `baseUrl`.
- On each request, the middleware calls `environmentSchema.parse(process.env)`. A validation error rejects the middleware request. The middleware provides the validated bindings to downstream code through `getAppBindings()`.
- The environment schema requires `BACKEND_URL` and accepts absolute HTTP and HTTPS URLs. This service has no `.env.example`.

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
- The workflow client defaults to no retries, a 10-second attempt timeout, and a 10-second total timeout.
- `getWorkflowConfig`, `createUpload`, `refreshDownloadGrant`, and `confirmDelete` keep these defaults.
- `dryRun` uses a 90-second attempt timeout and a 90-second total timeout.
- `scrubFile` uses a 240-second attempt timeout and a 240-second total timeout.
- Dry-run and scrub permit at most two retries. They retry only `POST` responses with status `503` and a positive whole-second `Retry-After` header.
- The workflow client uses the server's `Retry-After` value. It applies no client delay or client jitter. It caps `Retry-After` at 4000 ms. It does not retry timeouts, network failures, other status codes, or invalid header values.
- Backend status `400`, `404`, `408`, `409`, `413`, `415`, `422`, and `503` map to the matching safe tRPC error code.
- A Ky timeout maps to `TIMEOUT`. Invalid backend success JSON and invalid backend error JSON map to `BAD_GATEWAY`. Other upstream failures also map to `BAD_GATEWAY`.
- Public tRPC errors do not include backend error text, provider details, credentials, object keys, request IDs, or presigned URL details.
- Outbound failure handling uses neverthrow.
- Ky reads an error body before it throws. `HTTPError.data` contains the parsed body. A second body read failed in Node during a prior test. happy-dom hid that failure.

## Validation

The workflow schemas enforce these contracts:

- The Go backend owns the maximum source size.
- `getWorkflowConfig` supplies the frontend with a positive runtime `maxFileSizeBytes` value.
- The uploader uses this runtime value for its file-size restriction. The frontend does not own a copy of the limit.
- A storage key contains an `uploads/` prefix and one lower-case UUIDv4 value.
- A canonical ETag contains exactly 32 lower-case hexadecimal characters. It has no quotes or whitespace.
- A file name cannot start or end with whitespace. The schema rejects whitespace instead of changing the file name.
- A download-grant expiry is an RFC 3339 whole-second timestamp.

## File uploads

- The Uppy uploader accepts exactly one PDF file. It uses the runtime size limit from `getWorkflowConfig`.
- The uploader calls `createUpload` with the file name and file size. It does not send file bytes in the tRPC call.
- `createUpload` returns a private R2 `storageKey` and a presigned PUT URL.
- The browser sends the PDF bytes directly to private R2 with the presigned URL.
- Uppy stores the backend-generated `storageKey` in file metadata. Only `{ storageKey }` enters the wizard state after a successful upload.
- No frontend route parses or proxies file bytes.
- The Go backend owns R2 credentials and the file-size limit. The browser does not receive R2 credentials.
- The Go backend also owns PDF inspection, metadata removal, sanitized revisions, download grants, and confirmed deletion.

The root [architecture reference](../../docs/architecture.md) describes service integration.

## Tooling

- [package.json](../package.json) defines the available commands and scripts.
- `scripts/setup-node.sh` installs the pinned Node.js runtime and pnpm. It installs dependencies, then runs lint, fixes, tests, coverage, and a production build.
- `scripts/hard-clean.ts` and `scripts/soft-clean.ts` import only Node built-ins. They can run without installed dependencies.
- The lint checks cover ESLint rules, React Doctor findings, unused code, formatting, Oxlint rules, and TypeScript types. Knip checks unused files, dependencies, and exports. oxfmt checks formatting.
- React Doctor scans the frontend. Its configured ignores include generated output and the Oxlint plugin. It runs without interactive input. Telemetry, scoring, and the supply-chain scan are off. Warnings and errors fail the check.
- `eslint.config.ts` defines preset order, the Oxlint bridge, the parser root, and rule groups. It loads configuration arrays and rule maps from `eslint-config/*-rules.ts`. Each configuration module imports its own plugins.
- The [lint plugin reference](../oxlint-plugin-metadata-scrubber/README.md) describes custom rules and static-check limits.

## Testing status

- `vitest.config.ts` runs `src/**/*.server.test.ts` in the `server` project with Node and no setup file. It runs the other `src/**/*.test.{ts,tsx}` files in the `client` project with happy-dom and `src/tests/setup-test-environment.ts`.

- Direct tRPC caller tests cover all six workflow procedures and root-router registration.
- Tests check exact backend methods, paths, and JSON bodies. They compare each request body with its typed procedure input.
- Tests cover canonical ETag validation, invalid procedure inputs, invalid backend success bodies, safe status mapping, invalid backend error bodies, timeouts, and caller cancellation.
- Router tests cover backend status `413` as the safe tRPC `PAYLOAD_TOO_LARGE` error.
- Uploader tests cover runtime size restrictions, the PDF-only and one-file restrictions, non-multipart PUT signing, direct browser PUT requests, successful metadata handoff, grant failures, PUT failures, and manual retries.
- Uploader tests use the real `@uppy/aws-s3` plugin and a test-local `XMLHttpRequest` fake. They do not call R2.
- Workflow client tests cover the 4000 ms retry cap, the configured retry limit, and rejected retry conditions.
- Router transport tests check the dry-run and scrub total timeouts after a server-directed retry. They also cover config requests without retries, safe transport errors, and caller cancellation.
- Health transport tests check the 3000 ms attempt timeout, no retry after that timeout, and the one-retry limit for status `502`. They do not test the 5000 ms total timeout or either 250 ms cap.

# Current frontend architecture

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Framework

Developers build the frontend with [TanStack Start](https://tanstack.com/start) through `@tanstack/react-start`. They keep file-based routes under `src/routes/`. They mount tRPC at `src/routes/api/trpc.$.ts`.

## Browser analytics

- [`src/routes/__root.tsx`](../src/routes/__root.tsx) sends a public project token and fixed options through root loader data. [`posthog-browser-config.mod.server.ts`](../src/shared/config/posthog/posthog-browser-config.mod.server.ts) supplies both values. The root route starts `posthog-js` with `@posthog/react` in the browser.
- Development builds and SSR do not initialize PostHog. Vercel preview deployments use production builds.
- The client sends events and flag requests to PostHog US Cloud through `/relay`. It enables browser error tracking and web vitals.
- Session recording is off. The client uses default autocapture and `identified_only` person profiles.
- The frontend has no PostHog server SDK or browser Logs integration. The `/relay` proxy runs only on Vercel.
- The [service integration reference](../../docs/architecture.md#service-integration) describes relay routing and analytics headers.

## Deployment

- Vercel runs this service as a TanStack Start application. Vercel manages the server runtime.
- One instance can serve many requests at the same time.
- Vercel injects the backend's URL as a service binding.
- Vercel limits each request's run time and each instance's memory.

## Source layout

- Developers group feature code by domain under `src/domains/<domain>/`. The current domain is `wizard`.
- The wizard domain contains the typed file-workflow tRPC router, its wire contracts, and its tests.
- Developers keep cross-domain code under `src/shared/`. It contains `config`, `constants`, `libs` for tRPC and Ky, `middlewares`, and `utils`.
- TanStack Router reads file-based routes from `src/routes/`. Developers keep API routes under `src/routes/api/`.
- Developers keep test setup and shared render helpers under `src/tests/`. The render helpers are in `src/tests/utils/renderers/`.
- Module files use `.mod.ts` or `.mod.tsx`. Server-only modules use `.mod.server.ts`.
- Source tests use `.test.ts` or `.test.tsx` and sit next to the code they test.
- `tsconfig.app.json` maps the `#/` import alias to `src/`.
- The TanStack Router plugin generates `src/routeTree.gen.ts` during development and production builds. The service has no separate route-generation script.

## Server boundaries

- Browser tRPC calls end at the frontend adapter. The frontend procedures call the Go backend with Ky over HTTP/JSON.
- The `.server` module suffix marks server-only code. Other source modules can enter the client bundle, even when they contain a server callback.
- The root tRPC router registers only `wizard` ([`routers.mod.server.ts`](../src/shared/libs/trpc/routers/routers.mod.server.ts)).
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
- Server code calls `getAppBindings()`. The function returns `{ httpClient, posthogProjectToken, workflowHttpClient }`.
- The `httpClient` binding is the request-scoped health-check Ky client.
- The `workflowHttpClient` binding is the request-scoped file-workflow Ky client.
- Both clients use the validated backend URL as `baseUrl`.
- The request middleware rejects invalid environment values before downstream code runs.
- [`environment.mod.server.ts`](../src/shared/config/env/environment.mod.server.ts) defines and validates the settings.

## Backend HTTP

### Health transport

- The backend provides `GET /api/health` ([`backend/main.go`](../../backend/main.go)).
- The shared health-check Ky client remains in [`http-client.mod.server.ts`](../src/shared/libs/ky/http-client.mod.server.ts). No frontend tRPC procedure calls backend health.
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
- Before each eligible retry, the workflow client adds exponential full jitter. It selects a random whole-millisecond delay from 0 to 299 ms for the first retry and from 0 to 599 ms for the second retry.
- Ky then applies the server's `Retry-After` delay, capped at 4000 ms. This cap applies only to the server delay, not the combined wait. Both delays count against the total timeout.
- The workflow client does not retry timeouts, network failures, other status codes, or invalid header values.
- Backend status `400`, `404`, `408`, `409`, `413`, `415`, `422`, and `503` map to the matching safe tRPC error code.
- A Ky timeout maps to `TIMEOUT`. Invalid backend success JSON and invalid backend error JSON map to `BAD_GATEWAY`. Other upstream failures also map to `BAD_GATEWAY`.
- Public tRPC errors do not include backend error text, provider details, credentials, object keys, request IDs, or presigned URL details.
- Outbound failure handling uses neverthrow.
- Ky reads an error body before it throws. `HTTPError.data` contains the parsed body. A second body read failed in Node during a prior test. happy-dom hid that failure.

## Validation

The workflow schemas enforce these contracts:

- The Go backend owns the maximum source size.
- `getWorkflowConfig` supplies the frontend with a positive runtime `maxFileSizeBytes` value.
- The uploader uses its `maxFileSizeBytes` prop for its file-size restriction. The frontend does not own a copy of the limit.
- A storage key contains an `uploads/` prefix and one lower-case UUIDv4 value.
- A canonical ETag contains exactly 32 lower-case hexadecimal characters. It has no quotes or whitespace.
- A file name cannot start or end with whitespace. The schema rejects whitespace instead of changing the file name.
- A download-grant expiry is an RFC 3339 whole-second timestamp.

## File uploads

- The home route renders `FileWorkflow` ([`src/routes/index.tsx`](../src/routes/index.tsx)). It loads `wizard.getWorkflowConfig` once. The settings query disables automatic retries and refetches ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- `FileWorkflow` keeps the uploader unmounted while settings load or fail. After success, it passes the validated `maxFileSizeBytes` to `FileUploader` ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`wizard-contracts.mod.server.ts`](../src/domains/wizard/wizard-contracts.mod.server.ts)).
- If settings fail, `FileWorkflow` shows `Could not load upload settings. Try again.` The `Retry settings` button calls `config.refetch()` ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- The Uppy uploader accepts exactly one PDF file ([`file-uploader.mod.tsx`](../src/domains/wizard/components/file-uploader/file-uploader.mod.tsx), [`wizard.mod.ts`](../src/domains/wizard/constants/wizard.mod.ts)).
- The uploader calls `createUpload` with the file name and file size. It does not send file bytes in the tRPC call.
- `createUpload` returns a private R2 `storageKey` and a presigned PUT URL.
- The browser sends the PDF bytes directly to private R2 with the presigned PUT URL ([`file-uploader.mod.tsx`](../src/domains/wizard/components/file-uploader/file-uploader.mod.tsx)). The home-route test checks the PUT method, URL, and file body ([`file-workflow-entry.mod.test.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-entry.mod.test.tsx)).
- Uppy stores the backend-generated `storageKey` in file metadata. The uploader calls `onUploadComplete` with only `{ storageKey }` after a successful upload.
- `FileWorkflow` handles `onUploadComplete` with `inspectFile`. It starts one `wizard.dryRun` mutation with `{ storageKey }` for the completed upload. It ignores repeated completion callbacks and disables browser mutation retries ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- During inspection, `FileWorkflow` unmounts the uploader and shows `Inspecting the PDF. Please wait.` For errors other than typed `NOT_FOUND` or `UNPROCESSABLE_CONTENT`, it shows the fixed alert `Could not inspect the PDF.` instead of review ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- If inspection succeeds with `fields: []`, `FileWorkflow` opens the terminal `Already clean` view and focuses its heading. It says `No supported identifying metadata needs removal.` Only `Start again` is available. The frontend sends no scrub request and offers no result download. The input is not rewritten. The view keeps the warning that files expire after one day and deletion usually follows within 24 hours after expiry, but can take longer. Restart returns to a fresh uploader ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- After inspection succeeds with a non-empty field list, `FileWorkflow` keeps the reviewed `{ storageKey, etag }` pair and returned fields in memory. The ETag identifies the source revision. It is not a metadata field. The review does not display the key or ETag ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx)).
- `FileWorkflowReview` renders each backend field's name, label, preview, `originalByteSize`, and action as text, not HTML. It displays `remove` as `Remove` and `replace` as `Replace with a neutral value`. The backend supplies the field inventory, labels, and actions ([`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`wizard-contracts.mod.server.ts`](../src/domains/wizard/wizard-contracts.mod.server.ts)).
- The backend limits each preview to 256 UTF-8 bytes. The `originalByteSize` value counts the full original field value in bytes, not preview length or characters ([`scrub.go`](../../backend/internal/scrub/scrub.go), [`summary.go`](../../backend/internal/scrub/summary.go)).
- The review warns that previews can be shortened and that a neutral replacement does not remove the field. Before the user selects `Scrub it`, it limits metadata removal to Info, XMP, and custom metadata. It states that this does not cover all hidden PDF content or make the PDF safe to share ([`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx)).
- The `Scrub it` button gives explicit consent to call `wizard.scrubFile` with the stored reviewed `{ storageKey, etag }` pair. The frontend waits for the scrub response. It does not upload or inspect the file again. It does not poll ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- A synchronous guard blocks duplicate scrub clicks while the request is pending. The review stays visible, the scrub button is disabled, and `Scrubbing the PDF. Please wait.` reports progress. The result link appears only after success ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx)).
- On a scrub error other than typed `NOT_FOUND`, `UNPROCESSABLE_CONTENT`, or `CONFLICT`, the review stays visible with `Could not scrub the PDF. Try again.` The `Retry scrub` button retries the same reviewed pair without another inspection. Browser mutation retries are disabled ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx)).
- If inspection or scrub returns a typed tRPC `NOT_FOUND`, `FileWorkflow` uses the same reset as `Start again`. The fresh upload view focuses `Upload PDF` and shows the status `The PDF is no longer available. Upload the PDF again.` The notice disappears when the replacement upload starts inspection. The flow stays in memory on `/`, without resume parameters or durable flow restore ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`index.tsx`](../src/routes/index.tsx)).
- Typed tRPC `UNPROCESSABLE_CONTENT` from inspection or scrub opens the same terminal signed-PDF view. The backend maps `scrub.ErrSignedPDF` to HTTP `422`; the frontend uses the typed code, not error text. The view focuses `Signed PDF not supported`. It states that this version does not support signed PDFs and that metadata removal can invalidate a digital signature. Only `Start again` is available. The view has no scrub, retry, or download action. It keeps the warning that files expire after one day and deletion usually follows within 24 hours after expiry, but can take longer. Restart returns to a fresh upload ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`wizard-router.mod.server.ts`](../src/domains/wizard/wizard-router.mod.server.ts), [`workflow_support.go`](../../backend/internal/handler/workflow_support.go)).
- Typed tRPC `CONFLICT` from `scrubFile` opens the terminal `PDF changed` view and focuses its heading. The alert says `The PDF changed since review. Start again to upload and review the current PDF.` The view removes the old review and offers only `Start again`. It has no scrub confirmation, retry, or download action. The user must upload and review the current PDF before selecting `Scrub it` again. The frontend does not silently re-inspect the file or replace its reviewed ETag. The backend maps a failed source-download `If-Match` condition to HTTP `409`. This revision conflict is separate from the deletion `409` for remaining files ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`r2_source_download.go`](../../backend/internal/storage/r2_source_download.go), [`workflow_support.go`](../../backend/internal/handler/workflow_support.go), [`delete_flow.go`](../../backend/internal/handler/delete_flow.go)).
- After scrub success, `FileWorkflowResult` uses `useDownloadGrant` to request a fresh grant with the exact reviewed `{ storageKey, etag }` pair. `wizard.refreshDownloadGrant` sends `POST /api/files/download-grant`. Each refresh is one-shot, with browser mutation retries disabled and a guard against overlapping requests. The pair and grant stay in memory; refresh does not scrub again ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx), [`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts), [`wizard-router.mod.server.ts`](../src/domains/wizard/wizard-router.mod.server.ts)).
- The result discloses that `Producer`, `CreationDate`, and `ModDate` can have neutral replacements. These fields can remain with neutral values after removal of the original metadata. The backend permits this neutral trio in verified output, so a new inspection can still report these fields ([`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`analysis.go`](../../backend/internal/scrub/analysis.go), [`write.go`](../../backend/internal/scrub/write.go)).
- The initial scrub response still contains `status: "done"` and `result.downloadUrl`, but no `expiresAt`. The result does not use that URL or estimate expiry from its approximate lifetime. It uses the refreshed response's authoritative `expiresAt` ([`wizard-contracts.mod.server.ts`](../src/domains/wizard/wizard-contracts.mod.server.ts), [`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts)).
- Download stays disabled until a refresh returns a grant whose `expiresAt` is later than the browser's current time. A ready grant supplies the native `Download PDF` link with `referrerPolicy="no-referrer"` and no `download` attribute. The timer removes the usable link at expiry ([`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx)).
- While the download component is mounted and the tab is visible, the hook schedules renewal 2 minutes, or 120 000 ms, before the grant's authoritative `expiresAt`. It renews immediately if the grant is already within this lead time. Each new expiry sets the next schedule. A guard permits one scheduled renewal for each expiry value to prevent a renewal loop. Download stays disabled while renewal is pending ([`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts)).
- Hiding the tab cancels scheduled renewal but keeps the expiry timer. The timer does not renew in a hidden tab. On visible focus, `pageshow`, or `visibilitychange`, the result refreshes a non-ready or expired grant unless the output is missing. Otherwise, it updates the schedule. Download checks the clock again. An expired click blocks navigation and requests a fresh grant; the user must select Download again after recovery ([`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts)).
- Missing output and other refresh failures leave no usable link. Missing output shows `The result is no longer available. Refresh the link or start again.` Other failures show `Could not refresh the download link. Try again.` The `Refresh download link` button permits another one-shot request after expiry, missing output, or failure. Grant renewal does not extend object retention or confirm deletion. Link expiry and file deletion are separate ([`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`download_grant.go`](../../backend/internal/handler/download_grant.go)).
- Leaving the result view, selecting `Start again`, or confirming deletion unmounts the download component. This cancels its schedule and expiry timer and removes its return listeners. Requests already sent can still finish. The hook ignores late refresh successes and failures after unmount ([`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- The result view's `Delete files` button opens `Confirm file deletion`. The dialog focuses `Cancel`. `Cancel` or Escape closes the dialog, returns focus to `Delete files`, and sends no delete request ([`file-workflow-deletion.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-deletion.mod.tsx)).
- `Confirm deletion` sends one `wizard.confirmDelete` mutation with `{ storageKey }` to `POST /api/files/delete`. A synchronous guard blocks duplicate confirmation, and browser mutation retries are disabled. While the request is pending, Download and the delete button are disabled. The view shows `Waiting for the backend to confirm deletion.` ([`file-workflow-deletion.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-deletion.mod.tsx), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`wizard-router.mod.server.ts`](../src/domains/wizard/wizard-router.mod.server.ts)).
- Success focuses `Deletion confirmed` and shows `No stored files remained when the backend checked.` Already-missing files also count as success after the absence checks. The view no longer holds a usable download grant or offers link recovery. Late refresh responses cannot restore Download ([`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`file-workflow-download.mod.ts`](../src/domains/wizard/components/file-workflow/file-workflow-download.mod.ts), [`r2_delete_flow.go`](../../backend/internal/storage/r2_delete_flow.go)).
- Remaining objects or a dependency failure do not count as success. The result shows `Could not confirm deletion. Files may remain. Try again.` It focuses `Retry deletion`, which opens the confirmation dialog again. The download component mounts again and requests a fresh grant; failure does not prove that files remain available ([`file-workflow-deletion.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-deletion.mod.tsx), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`delete_flow.go`](../../backend/internal/handler/delete_flow.go)).
- Confirmed deletion checks absence of the source and all sanitized revisions. It does not stop an already-running scrub from publishing a result after the checks. Grant expiry and lifecycle cleanup are separate from confirmed deletion. The review, `Already clean`, `Signed PDF not supported`, and result views show `Files expire after one day. Deletion usually follows within 24 hours after expiry, but it can take longer.` The result keeps this notice after a download click, at grant expiry, and while deletion is pending or has failed. The confirmed-deletion view removes the notice. The wording gives no fixed deletion deadline ([`r2_delete_flow.go`](../../backend/internal/storage/r2_delete_flow.go), [`file_workflow.go`](../../backend/internal/handler/file_workflow.go), [`file-workflow-screens.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow-screens.mod.tsx), [`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- The `Start again` button appears in every step after upload. It clears the current flow's key, ETag, fields, and stored download URL. It resets mutation state and pending guards, then mounts a fresh uploader with the existing settings and focuses `Upload PDF`. Restart makes no new request ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
- Manual restart and missing-source reset change the flow generation before React renders the reset. The controller ignores old upload callbacks and late inspection or scrub successes and failures. They cannot reset the replacement flow, restore the old review, result, or error, or change the new flow's pending guard. Requests already sent can still finish. This is a browser-state reset, not backend deletion or URL revocation ([`file-workflow.mod.tsx`](../src/domains/wizard/components/file-workflow/file-workflow.mod.tsx)).
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
- Workflow client tests cover exponential full jitter, the 4000 ms server-delay cap, the two-retry limit, and rejected retry conditions. They also cover cancellation and total-timeout expiry during both delays.
- Router transport tests check the dry-run and scrub total timeouts after a server-directed retry. They also cover all four one-shot operations after a `503`, safe transport errors, and caller cancellation.
- Health transport tests check the 3000 ms attempt timeout, no retry after that timeout, and the one-retry limit for status `502`. They do not test the 5000 ms total timeout or either 250 ms cap.

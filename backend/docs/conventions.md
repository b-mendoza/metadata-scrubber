# Current backend conventions

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

Read the [root agent guide](../../AGENTS.md) for shared principles and [Code design](../../docs/agent/code-design.md) for construction over validation. This file lists mistakes that agents repeated in backend code and the required fix.

## Unknown and failed states

- Return an error for an unknown value or state, not `false`, a zero value, or success. Agents turned an unknown action into a successful empty-string report and treated an undecodable signature name as `false`. See `internal/handler/workflow_support.go`, `convertPublicFields`.
- Keep storage failure causes distinct with `ErrSourceNotFound` for a missing source in `internal/storage/storage.go`. Read caller cancellation from the caller's context, not a provider timeout, as in `internal/storage/r2_source_download.go`, `classifySourceDownloadError`. Classify malformed PDF bytes as public input errors only for client-supplied bytes, not server-produced bytes.
- Return the response-write error from the writer. Log the error in the handler. See `internal/handler/json.go`, `writeJSON`.

## Private data in responses and logs

- Return fixed public error text instead of parser or provider error text. Keep raw storage keys and panic values out of logs. Use `internal/handler/workflow_support.go`, `storageKeyDigest`. Test that raw keys stay out of logs with `internal/handler/handler_pipeline_log_security_test.go`, `TestPipelineLogsExcludeSeededSensitiveValues`.

## Storage and resource limits

- Check every listed key against the code-constructed prefix before a bulk delete. Treat a foreign key as a dependency failure and send no delete request. See `internal/storage/r2_delete_flow.go`, `sanitizedObjectIdentifiers`.
- Limit storage HTTP requests with an overall timeout. Set `ContentLength` to the declared upload byte size before you sign the upload grant. Agents issued an upload grant with no object size limit. See `internal/storage/r2.go`, `r2RequestTimeout`, and `internal/storage/r2_presign.go`, `ContentLength`.
- Treat the two admission permits as an active PDF work limit, not a queue or memory limit. A request can wait up to two seconds for a permit. The permits do not limit the number of waiting requests or memory; see `internal/handler/handler.go`, `Handler.permits`.
- Keep the parser limits in `internal/scrub/read.go`. Change a limit only with measured evidence.

## Construction

- Build URLs and header values with standard-library encoders such as `url.URL` and `mime.FormatMediaType`. Agents joined variable text directly into URLs or header values. See `internal/config/config.go`, `url.URL`.
- Dispatch on type with a type switch and keep the typed value inside its case. Agents used formatted type names as keys in a function map. See `internal/scrub/traversal.go`, `walkObject`.
- Construct code-owned operation functions directly. Do not add nil checks, panics, or rejection tests for these functions. Agents added these checks during a hardening change. Pass a test function as an argument instead of replacing a package-level variable. See `internal/scrub/read.go`, `readPDFWithValidator`.
- Require the caller to pass the logger. Do not fall back to `slog.Default()` when a caller passes `nil`. See `internal/httpx/logging.go`, `RequestLogger`, and `internal/handler/handler.go`, `New`.

## Functions

- Do not write an immediately invoked function, or IIFE. Pass a named function to `go` or `defer`, or call a named function. See `serveHTTPServer` in `main.go`. Anonymous function literals are fine as inline callbacks, struct fields, or arguments.
- To join a cleanup error with the result, call the body from an outer function. Run the cleanup and return `errors.Join` of both errors when cleanup fails. See `internal/scrub/analysis.go`, `inspectMetadataEntry` and `analyzeMetadataStream`.
- Move a named local function to package scope only when it reads no variable from its enclosing function. This avoids a new function on each call. See `runConcurrentPDFByteAPIs` in `internal/scrub/scrub_clean_test.go`. Keep anonymous callbacks passed as arguments inline.

## Tests

- Build and serialize each endpoint's typed payload at the test call site. Keep each handler call explicit. For concurrent requests, use one named worker for each endpoint. Share each worker across the tests. Each worker must call its endpoint explicitly. Do not select payload types or handlers through an enum or a boolean. See `internal/handler/handler_admission_test.go`, `TestScrubReleasesPermitBeforeUploadingSanitizedBytes`.
- Test endpoint responses through the real handler with a typed request. Agents called `writeAdmissionFailure` directly to claim endpoint coverage. See `internal/handler/handler_admission_test.go`, `TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource`.
- Inject a short timeout and coordinate goroutines with channels. Agents used a wall-clock upper bound such as three seconds to test completion. See `internal/handler/handler_admission_test.go`, `TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource`.
- Assert required log records and the absence of false success records without comparing the complete ordered log slice. See `internal/handler/handler_pipeline_log_test.go`, `require.Contains` and `require.NotContains`.
- Test public behavior. Do not assert which of several invalid inputs the code rejects first. Do not use reflection to check the field count or field names of a struct.
- Build PDF test fixtures from typed pdfcpu objects such as `types.Dict`, `types.StringLiteral`, and `types.StreamDict`. Check each error. Use raw PDF text only in dedicated PDF wire-contract tests. See `internal/scrub/scrub_test.go`, `TestInspectPDFPreservesSharedCompressedMetadataReferences`.

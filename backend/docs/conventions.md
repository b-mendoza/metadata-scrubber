# Backend decided conventions

This file records the backend's chosen patterns and their reasons.
Follow these conventions in new and changed code.
Report code that disagrees with a convention. Do not copy that pattern.

## Unknown and failed states

- Return an error for an unknown metadata action or an undecodable signature name. Do not return `false` or a successful zero value. Either failure prevents reliable inspection.
- Use `ErrSourceNotFound` for a missing source. Callers must distinguish a missing file from a storage dependency failure.
- Read cancellation from the caller's context. Treat a provider timeout as `ErrDependency` while that context is still active. A stalled provider is not caller cancellation.
- Apply `ErrMalformedPDF` only to rejected client-supplied PDF bytes. Keep writer and output-verification failures internal. The server produced those output bytes, not the client.
- Return response-write errors from the writer and log them in the handler. The handler owns the request context and logger.

## Private data in responses and logs

- Return fixed public error messages instead of parser or provider error text. Those errors can contain private URLs and storage keys.
- Use `storageKeyDigest` instead of a raw storage key in logs. Test that raw keys stay out of logs. This permits flow tracing without exposing the key.
- Keep panic values out of application logs. Record whether a panic occurred instead. A panic value can contain private data.

## Storage and resource limits

- Check every listed key against the code-constructed prefix before a bulk delete. Return `ErrDependency` for a foreign key and send no bulk-delete request for that page. A provider listing does not grant permission to delete another file's objects.
- Give storage HTTP requests an overall timeout independent of caller cancellation. A stalled response must end even if the client stays connected.
- Set `ContentLength` to the declared upload byte size before signing an upload grant. The signature must bind the grant to that size.
- Acquire an admission permit before downloading source bytes for PDF processing. Limit active work that holds large buffers. Permits do not bound the waiting queue or total memory.
- Reject work when its admission wait expires. A bounded wait avoids keeping a request blocked until processing capacity becomes free.
- Keep parser limits in `internal/scrub/read.go`. Change them only with measured evidence. Compressed input can expand beyond its uploaded size.

## Construction

- Build variable URLs with `url.URL` instead of joining URL text. Structured construction keeps input inside its intended URL component.
- Use a type switch for PDF object dispatch instead of a function map keyed by formatted type names. Display text is not type identity.
- Construct code-owned operation functions directly. Do not add nil guards, defensive panics, or nil-rejection tests for those functions. Their constructors supply them; they are not external input.
- Pass test operations as arguments or set function fields on the test instance. Do not replace package variables. Tests must not change another request's dependencies.
- Keep anonymous callbacks inline at their call or struct field. This keeps captured values next to their use.
- Require the caller's logger. Do not replace a nil logger with a global logger. A fallback would hide a missing dependency.

## Cleanup

- Use named functions for deferred cleanup. This keeps cleanup logic separate from the operation.
- When cleanup can fail, call the operation body from an outer function, then run cleanup. Use `errors.Join` to retain both errors if cleanup fails. A cleanup failure must not hide the body failure.

## Tests

- Test endpoint responses through the real handler. Keep each endpoint and its payload type explicit instead of selecting them with an enum or boolean. Helper-only tests do not cover endpoint wiring.
- Inject a short timeout and coordinate goroutines with channels. Use deadlines to detect a stuck test, not to prove that work finishes at a particular speed. Machine load must not decide correctness.
- Use `require.Contains` for required log records and `require.NotContains` for false-success records. Do not compare the complete ordered log slice. Extra records or a different order need not change the contract.
- Test one invalid input at a time and assert public results and effects. Do not assert struct field counts or names. Validation order and struct layout are not public contracts.
- Build PDF fixtures from typed pdfcpu objects. Typed construction keeps test intent separate from PDF serialization details.

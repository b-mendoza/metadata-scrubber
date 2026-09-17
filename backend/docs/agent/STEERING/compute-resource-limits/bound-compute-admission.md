# Share one process admission gate

Scope: dry-run and scrub processing. Create one channel of capacity 2 at startup and share it across requests. It limits admitted stages in one process, not requests, endpoints, or the fleet.

## Do's

### Correct: Create the shared gate at startup

Context: [`main.go`](../../../../main.go), inside `newServer`. Capacity is the fixed `handler.ProcessingPermitCount`.

```go
workflow := handler.New(logger, make(chan struct{}, handler.ProcessingPermitCount))
```

### Correct: Acquire before downloading and release when the stage ends

Context: [`internal/handler/file_workflow.go`](../../../../internal/handler/file_workflow.go), inside `inspectSource`. `cleanSource` uses the same gate. Both stages check admission before downloading source bytes, then release with `defer`.

```go
release, err := handler.acquirePermit(inspectWorkflow.request.Context())
if err != nil {
	return "", nil, fmt.Errorf("%w: %w", errAdmissionFailure, err)
}
defer release()
```

[`acquirePermit`](../../../../internal/handler/workflow_support.go) checks the caller's context before waiting and after acquisition. It returns the permit immediately if that context ended during acquisition. The wait has a 2 s budget. Caller cancellation or deadline expiry returns the caller's error; only the admission wait expiring returns `errAdmissionTimeout`.

### Correct: Refuse admission timeout with a checked retryable response

Context: [`writeAdmissionFailure`](../../../../internal/handler/workflow_support.go), inside its `errAdmissionTimeout` branch. It returns `503` with whole-second `Retry-After`, base 2 plus jitter of 0..2. If jitter generation fails, the hint is 2. Caller cancellation or deadline expiry instead returns `408` without this retry hint.

```go
w.Header().Set(header.RetryAfter, handler.admissionRetryAfter(request.Context()))
if writeErr := httpx.WriteError(w, http.StatusServiceUnavailable, admissionTimeoutMessage); writeErr != nil {
	handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
}
```

## Don'ts

### Wrong: Create a gate inside each request

Wrong request-local acquisition. Every request gets its own empty channel, so they do not share capacity.

```go
permits := make(chan struct{}, ProcessingPermitCount)
permits <- struct{}{}
```

A separate gate per endpoint also bypasses the shared process cap. See [capacity distinctions](shared-capacity-concurrency.md) for the separate waiter-count and wait-time limits.

### Wrong: Claim the gate covers cache hits or sanitized upload

```text
A cached scrub must wait for a permit.
The permit stays held until UploadSanitized completes.
```

Exact-revision cache hits bypass admission. `materializeScrubbed` calls `UploadSanitized` only after `cleanSource` returns and releases its permit. Do not move either operation into the gated stage.

### Wrong: Treat admission as CPU preemption or a total cost ceiling

```text
Canceling a context stops an in-flight PDF computation immediately.
Two permits guarantee a fixed peak memory use and a bounded fleet bill.
```

Cancellation does not preempt non-cooperative CPU work. Parser resource limits, retained output buffers, concurrent waiters, storage operations, and fleet activity remain separate concerns.

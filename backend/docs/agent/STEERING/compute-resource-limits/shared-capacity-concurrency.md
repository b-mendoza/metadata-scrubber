# Distinguish work, queue, and wait limits

Scope: concurrency limits in the backend. An active-work cap, a waiter-count cap, and a wait-time budget bound different things. Use the existing [admission gate](bound-compute-admission.md); do not infer limits it does not enforce.

## Do's

### Correct: State all three bounds separately

Context: [`internal/handler/handler.go`](../../../../internal/handler/handler.go) and [`acquirePermit`](../../../../internal/handler/workflow_support.go). The channel holds acquired permits, not queued requests. Its length counts admitted stages, including their source downloads.

```text
Active stages: at most 2 share the process gate.
Waiter count: the implementation has no explicit cap.
Admission wait: a 2 s budget, shortened by the caller's cancellation or deadline.
```

The unbounded waiter count is a current limitation, not a prohibition on queue-length limits. A finite wait does not bound how many requests can wait at once. Any queue policy must account for that distinction rather than assume the platform handles it.

### Correct: Keep overload separate from caller cancellation

Context: the behavior covered by [`handler_admission_capacity_test.go`](../../../../internal/handler/handler_admission_capacity_test.go).

```text
Both permits are held. A third request reaches its admission timeout.
It gets 503 with Retry-After and does not download its source.
If its own context ends first, it gets 408 without Retry-After.
```

## Don'ts

### Wrong: Call a two-permit pool a two-request queue

```text
The gate has capacity 2, so no more than two requests can wait or hold memory.
A separate waiter-count limit is always forbidden.
```

### Wrong: Wait without a budget

Wrong acquisition replacement. A full channel can block the request indefinitely.

```go
handler.permits <- struct{}{}
```

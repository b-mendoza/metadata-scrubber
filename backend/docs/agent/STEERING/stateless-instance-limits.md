# Separate instance state from request state

Scope: backend state and resource lifetimes. Requests can share an instance under Vercel Fluid compute. Process memory is not durable workflow storage, and concurrent requests share its resource budget.

Keep initialized configuration, the storage client, the validator cache, and the admission gate at process lifetime. Keep each request's input, ETag, buffers, and workflow values local. Request bindings carry the existing dependencies; they do not create an isolated client or memory budget.

## Do's

### Correct: Build the workflow value within its request

Context: [`internal/handler/file_workflow.go`](../../../internal/handler/file_workflow.go), inside `Scrub` after input validation and storage binding lookup. `objectStorage` is shared; this workflow value belongs to the current request.

```go
scrubWorkflow := scrubWorkflowRequest{
	request: request, objectStorage: objectStorage, fileID: fileID, input: input, startedAt: startedAt,
}
```

### Correct: Tie resources to the stage that uses them

Context: `cleanSource` and `materializeScrubbed` in [`internal/handler/file_workflow.go`](../../../internal/handler/file_workflow.go). Follow [admission](bound-compute-admission.md) and [PDF resource limits](bound-compute-resources.md) rather than duplicating them.

```text
cleanSource holds a permit for the source download and PDF cleaning.
Its deferred release runs when the stage returns, including error paths.
materializeScrubbed then uploads the returned bytes without that permit.
Those bytes remain live while the upload needs them.
```

Permit release is not a promise of immediate memory reclamation. Use context cancellation for cooperative waits and I/O; do not rely on client disconnect or assume process termination runs deferred cleanup.

## Don'ts

### Wrong: Make process memory the durable workflow record

```text
Keep the reviewed ETag only in a process map after dry-run.
Assume scrub will reach the same instance and read that map.
```

### Wrong: Treat shared dependencies as request isolation

```text
Each request context has bindings, so each request owns a separate storage client,
CPU, and memory allowance. Releasing its permit immediately frees every buffer.
```

The process gate does not specify fleet capacity or guarantee platform scale-out. Do not promise a total memory or billing ceiling from it.

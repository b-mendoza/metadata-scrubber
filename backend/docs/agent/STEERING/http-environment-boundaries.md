# Validate HTTP and environment inputs

Scope: request decoding, response writing, error mapping, and configuration loading. Reject malformed input at the shared boundary. Keep internal causes and provider details out of public responses.

## Do's

### Correct: Call the strict JSON helper and check its result

Context: [`internal/handler/file_workflow.go`](../../../internal/handler/file_workflow.go), inside `Scrub` before storage or PDF work.

```go
input, ok := decodeJSONRequest[scrubRequest](handler.logger, w, request)
if !ok {
	return
}
```

[`decodeJSONRequest`](../../../internal/handler/json.go) owns the 4 KiB body limit, `application/json` media-type check, unknown-field rejection, and trailing-value rejection. It checks error-response writes. Keep these checks in the helper instead of copying a partial decoder into each caller.

### Correct: Parse and validate the environment before startup

Context: [`internal/config/config.go`](../../../internal/config/config.go). Required R2 values must be nonblank. `PORT` defaults to 8080 and must be in 1..65535. Use `config.Load` rather than reading environment variables in handlers.

```go
func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("reading environment: %w", err)
	}

	if err := configValidator.Struct(cfg); err != nil {
		return Config{}, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}
```

### Correct: Pass a safe message and check each response write

Context: [`internal/handler/delete_flow.go`](../../../internal/handler/delete_flow.go), inside `deleteStoredFlow` after checking the known conflict.

```go
if err != nil {
	handler.writeUnexpectedFailure(w, request, err, "could not delete file")
	return false
}
```

Context: [`internal/handler/workflow_support.go`](../../../internal/handler/workflow_support.go). This helper returns no value. It maps caller cancellation or deadline expiry to `408`; other unexpected failures use `500`. It logs failed writes rather than exposing `err.Error()`.

```go
func (handler *Handler) writeUnexpectedFailure(w http.ResponseWriter, request *http.Request, err error, internalMessage string) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		if writeErr := httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return
	}
	if writeErr := httpx.WriteError(w, http.StatusInternalServerError, internalMessage); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
}
```

Admission timeout has its own `503` response with `Retry-After`; keep it distinct from caller cancellation. See [admission](bound-compute-admission.md).

## Don'ts

### Wrong: Return the internal cause as the public message

Wrong response inside a handler. `http.Error` returns no error, but the message can leak keys, paths, or provider details.

```go
http.Error(w, err.Error(), http.StatusInternalServerError)
```

### Wrong: Replace the shared decoder with permissive intake

```text
Decode the first JSON value directly in Scrub and continue.
Ignore Content-Type, unknown fields, body size, and trailing values.
```

### Wrong: Continue startup with invalid required configuration

```text
If R2_BUCKET is missing or contains only spaces, log a warning and start anyway.
Wait for the first storage operation to discover the missing setting.
```

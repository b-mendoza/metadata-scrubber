# Inject storage through the port

Scope: startup, middleware, handlers, and storage adapters. Keep provider SDK types inside the adapter. Reuse the startup client through `storage.Storage` rather than building a client for each request.

## Do's

### Correct: Validate configuration, then construct the adapter once

Context: [`main.go`](../../../main.go), inside `run`. `config.Load` returns an error; `storage.NewR2` returns only `*R2` and does not contact storage during construction.

```go
cfg, err := config.Load()
if err != nil {
	return err
}

logger := slog.Default()
server := newServer(cfg, storage.NewR2(cfg), logger)
```

### Correct: Inject the existing adapter into request bindings

Context: [`main.go`](../../../main.go), the return from `newServer`. Its `objectStorage` argument is `storage.Storage`; `mux` already has the workflow routes.

```go
return &http.Server{
	Addr: fmt.Sprintf(":%d", cfg.Port),
	Handler: httpx.RequestLogger(logger)(httpx.CORS(bindings.Inject(bindings.Bindings{
		Env:     cfg,
		Storage: objectStorage,
	})(mux))),
	ReadHeaderTimeout: readHeaderTimeout,
}
```

Handlers use domain values such as file IDs, ETags, and grants. They must not accept AWS SDK request types or assert the port to a concrete adapter. The provider-neutral port also supports the in-memory `storage.Fake`.

### Correct: Check the request binding before using the port

Context: [`internal/handler/file_workflow.go`](../../../internal/handler/file_workflow.go), inside `Scrub`. `storageFromRequest` handles a missing binding with a safe response and checks the response write.

```go
objectStorage := handler.storageFromRequest(w, request)
if objectStorage == nil {
	return
}
```

## Don'ts

### Wrong: Rebuild the provider adapter in a request helper

Wrong replacement inside `storageFromRequest`. Checking configuration errors does not fix the per-request client lifetime or provider coupling.

```go
cfg, err := config.Load()
if err != nil {
    handler.writeUnexpectedFailure(w, request, err, "service unavailable")
    return nil
}
return storage.NewR2(cfg)
```

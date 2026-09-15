# Require concrete types and meaningful constraints

Scope: backend application code. [`lint/noemptyinterface`](../../../lint/noemptyinterface/noemptyinterface.go) rejects `any`, literal empty interfaces, and names or aliases that resolve to an empty interface. Analyzer test fixtures intentionally contain rejected forms.

## Do's

### Correct: Constrain a generic to the shapes it supports

Context: [`internal/handler/json.go`](../../../internal/handler/json.go). The response union names every supported response type. The function propagates the encoder error; callers must check it.

```go
func writeJSON[T reachabilityResponse | workflowConfigResponse | uploadResponse | dryRunResponse | scrubResponse | downloadGrantResponse | deleteResponse](
	w http.ResponseWriter,
	status int,
	body T,
) error {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(body)
}
```

Use generics only when one implementation genuinely supports several types. Require the accepted types or needed operations in the constraint; do not replace `any` with another constraint that erases the same contract.

### Correct: Use the concrete request type and check decoding

Context: [`internal/handler/file_workflow.go`](../../../internal/handler/file_workflow.go), inside `Scrub`. The shared decoder has its own explicit request union.

```go
input, ok := decodeJSONRequest[scrubRequest](handler.logger, w, request)
if !ok {
	return
}
```

For behavior-based dependencies, use named interfaces with the operations the caller needs, such as [`storage.Storage`](../../../internal/storage/storage.go). See [storage injection](storage-port-injection.md). Keep a concrete type when only one shape is accepted.

## Don'ts

### Wrong: Erase the request shape with an empty interface

Wrong replacement inside `Scrub`. The decoder error is checked, but `input` has no request contract.

```go
var input any
if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
    handler.writeUnexpectedFailure(w, request, err, "could not decode request")
    return
}
```

### Wrong: Hide an empty interface behind another spelling

These declarations are rejected too; renaming does not restore type information.

```go
type Payload interface{}
type Message = interface{}
```

### Wrong: Widen the response writer to an unconstrained generic

Wrong replacement for `writeJSON`. Keeping encoder error propagation does not make `T any` a meaningful constraint.

```go
func writeJSON[T any](w http.ResponseWriter, status int, body T) error {
    w.Header().Set(header.ContentType, mediatype.JSON)
    w.WriteHeader(status)
    return json.NewEncoder(w).Encode(body)
}
```

Only an unavoidable third-party API can justify the root rule's narrow, explained suppression. The `go/analysis` callback signature is not permission to use empty interfaces in application code.

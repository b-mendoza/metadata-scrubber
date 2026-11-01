# Backend decided conventions

This file records the backend's chosen patterns and their reasons.
Follow these conventions in new and changed code.
Report code that disagrees with a convention. Do not copy that pattern.

## Unknown and failed states

- Return an error for an unknown metadata action or a signature name the code cannot decode. Do not return `false` or a successful zero value. Either failure blocks reliable inspection.

```go
switch field.Action {
case scrub.ActionRemove:
	action = publicFieldActionRemove
case scrub.ActionReplace:
	action = publicFieldActionReplace
default:
	return nil, fmt.Errorf("unsupported field action %q", field.Action)
}
```

Do not skip an unknown action:

```go
return fields, nil
```

A signature type name that cannot decode is also an error:

```go
decodedName, err := types.DecodeName(name.Value())
if err != nil {
	return false, fmt.Errorf("decode PDF dictionary Type: %w", err)
}
```

- Use `ErrSourceNotFound` for a missing source. Callers must tell a missing file from a storage dependency failure.

```go
return fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceNotFound)
```

Do not hide a missing source as success:

```go
return SourceObject{}, nil
```

- Read cancellation from the caller's context. Treat a provider timeout as `ErrDependency` while that context is still active. A stalled provider is not caller cancellation.
- Apply `ErrMalformedPDF` only to rejected client-supplied PDF bytes. Keep writer and output-verification failures internal. The server produced those output bytes, not the client.

```go
return fmt.Errorf("%w: %w", ErrMalformedPDF, err)
```

- Return response-write errors from the writer and log them in the handler. The handler owns the request context and logger.

```go
if writeErr := httpx.WriteError(w, failure.status, failure.message); writeErr != nil {
	handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
}
```

## Private data in responses and logs

- Hold each storage key in the `storageKey` type, not in a `string`. The type lets lint find a raw key in a log call. A plain `string` hides the key from that check.

## Storage and resource limits

- Check every listed key against the code-constructed prefix before a bulk delete. Return `ErrDependency` for a foreign key and send no bulk-delete request for that page. A provider listing does not grant permission to delete another file's objects.
- Set `ContentLength` to the declared upload byte size before signing an upload grant. The signature must bind the grant to that size.
- Get an admission permit before downloading source bytes for PDF processing. Limit active work that holds large buffers. Permits do not bound the waiting queue or total memory.
- Reject work when its admission wait runs out. A bounded wait avoids keeping a request blocked until processing capacity becomes free.
- Keep parser limits in `internal/scrub/read.go`. Change them only with measured evidence. Compressed input can expand beyond its uploaded size.

## Construction

- Use a type switch for PDF object dispatch instead of a function map keyed by formatted type names. Display text is not type identity.

```go
switch value := object.(type) {
case types.Dict:
	return walker.walkDictionary(value, nested)
case types.StreamDict:
	return walker.walkDictionary(value.Dict, nested)
case types.ObjectStreamDict:
	return walker.walkDictionary(value.Dict, nested)
case types.XRefStreamDict:
	return walker.walkDictionary(value.Dict, nested)
case types.Array:
	return walker.walkArray(value)
default:
	return nil
}
```

- Construct code-owned operation functions directly. Do not add nil guards, defensive panics, or nil-rejection tests for those functions. Their constructors supply them; they are not external input.

## Cleanup

- When cleanup can fail, call the operation body from an outer function, then run cleanup. Use `errors.Join` to keep both errors if cleanup fails. A cleanup failure must not hide the body failure.

```go
return errors.Join(bodyErr, fmt.Errorf("release PDF metadata stream cache: %w", cleanupErr))
```

## Tests

- Test endpoint responses through the real handler. Write each endpoint and its payload type in the test. Do not select them with an enum or boolean. Helper-only tests do not cover endpoint wiring.
- Pass a short timeout and time goroutines with channels. Use deadlines to detect a stuck test, not to prove that work finishes at a particular speed. Machine load must not decide correctness.
- Compare the full ordered list of log records with `require.Equal`. An exact list keeps log output deterministic and also rejects an extra false-success record. Capture each record into a test struct that has only the fields the test checks. The capture handler skips all other attributes.

For a rejected non-PDF upload, require the exact ordered record list:

```go
require.Equal(t, []pipelineLogRecord{
	{Message: "pipeline stage", Level: slog.LevelInfo, Stage: "sniffed", StorageKeyDigest: storageKeyDigestOne, Outcome: "rejected", DurationRecorded: true},
	{Message: "pipeline stage", Level: slog.LevelInfo, Stage: "dry-run", StorageKeyDigest: storageKeyDigestOne, Outcome: "not-pdf", DurationRecorded: true},
}, records)
```

- Test one invalid input at a time and assert public results and effects. Do not assert struct field counts or names. Validation order and struct layout are not public contracts.
- Build PDF fixtures from typed pdfcpu objects. Typed construction keeps test intent separate from PDF serialization details.

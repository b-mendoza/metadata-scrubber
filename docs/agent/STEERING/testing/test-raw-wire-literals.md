# Build typed payloads at each test call site

Scope: every test that sends or supplies a serialized request or response.

Why: concrete contracts catch fixture drift. Dedicated wire tests check raw protocol details separately.

## Do's
### Use concrete request and response types, serialize locally, and check every error

These call-site excerpts use the existing `uploadRequest` and `uploadResponse` types in Go handler tests. `t` is the current test. Pass the resulting bytes to the request or response boundary under test.

```go
requestPayload := uploadRequest{FileName: "report.pdf", FileSizeBytes: 1}
requestBody, err := json.Marshal(requestPayload)
require.NoError(t, err)

responsePayload := uploadResponse{
	StorageKey: "uploads/123e4567-e89b-42d3-a456-426614174000",
	UploadURL:  "https://storage.example.test/upload",
}
responseBody, err := json.Marshal(responsePayload)
require.NoError(t, err)
```

Check transport and response-decoding errors too. Keep raw wire literals in dedicated wire-contract tests and nowhere else. Those tests can exercise malformed JSON, exact field names, and values that typed contracts cannot represent.

## Don'ts
### Do not use raw JSON in ordinary tests or hide serialization in a generic helper

The raw body below belongs only in a dedicated wire-contract test, not an ordinary upload behavior test.

```go
requestBody := []byte(`{"fileName":"report.pdf","fileSizeBytes":1}`)
```

Do not replace concrete payloads with untyped maps or a helper that hides each call site's type, serialization, or errors.

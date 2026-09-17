# Bind revisions and verify deletion

Scope: scrub, sanitized storage, download-grant refresh, and deletion. Scrub must read the reviewed revision and use that revision in the sanitized key. Report deletion only after the storage port confirms an empty flow.

## Do's

### Correct: Check source existence before the scrub cache

Context: [`internal/handler/file_workflow.go`](../../../../internal/handler/file_workflow.go), inside `Scrub`. Source availability must pass before the sanitized revision lookup.

```text
Check source existence.
If the source check fails, stop later storage and PDF work.
If the source is absent, return 404.
Then check the sanitized cache for the requested fileID and ETag.
An exact-revision cache hit skips admission and source download.
A cache miss acquires shared capacity before source download and processing.
```

### Correct: Check the conditional source read

Context: [`internal/handler/file_workflow.go`](../../../../internal/handler/file_workflow.go), inside `cleanSource` after admission. The caller validates the canonical ETag. Sniffing and cleaning follow this checked read.

```go
source, err := scrubWorkflow.objectStorage.DownloadSource(scrubWorkflow.request.Context(), scrubWorkflow.fileID, scrubWorkflow.input.ETag)
if err != nil {
	return nil, err
}
```

The R2 adapter sends `If-Match` for a nonempty expected ETag. A changed revision becomes `ErrSourceRevisionConflict` and an HTTP `409`. Dry-run may read with an empty expected ETag because it discovers the current revision; scrub may not.

### Correct: Derive the immutable key from `sourceETag`

Context: [`internal/storage/storage.go`](../../../../internal/storage/storage.go). `UploadSanitized` uses this key with the reviewed ETag. The key identifies one source revision; a repeated write for that same revision is allowed.

```go
func SanitizedObjectKey(fileID string, sourceETag string) (string, error) {
	prefix, err := SanitizedObjectPrefix(fileID)
	if err != nil {
		return "", err
	}
	if err := validateCanonicalETag(sourceETag); err != nil {
		return "", err
	}

	encodedETag := base64.RawURLEncoding.EncodeToString([]byte(sourceETag))
	return prefix + encodedETag, nil
}
```

### Correct: Refresh only the exact sanitized revision

Context: [`internal/handler/download_grant.go`](../../../../internal/handler/download_grant.go), inside `DownloadGrant`. This refresh checks sanitized output, not source availability.

```text
Check that the requested sanitized fileID/ETag revision exists.
Stop on a check failure; return 404 if that revision is absent.
Presign that same revision for 15 minutes.
Return its expiry as UTC RFC3339 with whole-second precision.
Do not download the source or rerun PDF processing.
```

### Correct: Verify storage before returning deletion success

Context: the end of `R2.DeleteFlow` in [`internal/storage/r2.go`](../../../../internal/storage/r2.go), after checked key construction.

```go
if err := r2.deleteSource(ctx, sourceKey); err != nil {
	return err
}
if err := r2.deleteSanitizedRevisions(ctx, sanitizedPrefix); err != nil {
	return err
}
return r2.verifyFlowEmpty(ctx, sourceKey, sanitizedPrefix)
```

`deleteSanitizedRevisions` visits every provider page. A batch response can contain per-item errors even when the request succeeds. The adapter uses final verification as the authority, including after a partial result: check source absence and the sanitized prefix. An empty flow succeeds; a remaining object returns `ErrFlowObjectsRemain`. A failed verification is not proof of deletion.

Context: [`internal/handler/delete_flow.go`](../../../../internal/handler/delete_flow.go), inside `DeleteFlow`. `deleteStoredFlow` maps `ErrFlowObjectsRemain` to `409` and checks the error response write. Its boolean must pass before the success write.

```go
if !handler.deleteStoredFlow(w, request, objectStorage, fileID) {
	return
}
if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
	handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
}
```

## Don'ts

### Wrong: Bypass source checks or substitute another download revision

```text
Serve a scrub cache hit before checking whether its source exists.
Refresh a download grant for any available revision instead of the requested ETag.
Rerun PDF processing to refresh an expired download grant.
```

### Wrong: Drop the reviewed ETag during scrub

Wrong replacement inside `cleanSource`. The read is unconditional even though its error is checked.

```go
source, err := scrubWorkflow.objectStorage.DownloadSource(scrubWorkflow.request.Context(), scrubWorkflow.fileID, "")
if err != nil {
    return nil, err
}
```

### Wrong: Ignore the verified-delete result

Wrong replacement inside `Handler.DeleteFlow`. The port already verifies deletion; discarding its error hides a conflict or dependency failure.

```go
_ = objectStorage.DeleteFlow(request.Context(), fileID)
if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
    handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
}
```

### Wrong: Give every revision the same sanitized key

Wrong replacement for the return in `SanitizedObjectKey`. It ignores `sourceETag`.

```go
return "sanitized/" + fileID + "/cleaned.pdf", nil
```

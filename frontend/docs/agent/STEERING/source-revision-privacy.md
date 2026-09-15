# Bind sanitized outputs to the source revision

Scope: sanitized outputs, deletions, and public errors.

Why: a download must match the reviewed source, and provider details must stay private.

## Do's

### Keep review, scrub, and download refresh on the same revision

Use the canonical source `etag` returned by `dryRun` with the same `storageKey` for `scrubFile` and `refreshDownloadGrant`. For example, both procedures accept this revision-bound input:

```json
{
  "etag": "0123456789abcdef0123456789abcdef",
  "storageKey": "uploads/123e4567-e89b-42d3-a456-426614174000"
}
```

The backend stores each sanitized output under an immutable source-revision key. A changed source requires a new review and sanitized output. Do not present a stale output as current.

### Confirm deletion before reporting success

Require explicit confirmation before `confirmDelete`. The backend removes the source and every sanitized revision before it returns this response:

```json
{ "status": "deleted" }
```

## Don'ts

### Do not expose provider text or private identifiers in public errors

This error leaks an object key and a provider request ID:

```json
{
  "code": "BAD_GATEWAY",
  "message": "R2 failed for uploads/123e4567-e89b-42d3-a456-426614174000; request ID provider-123"
}
```

Keep upstream text, credentials, keys, signed URLs, and request IDs out of public errors. Preserve the cause internally and return a [safe mapped error](safe-error-boundary.md).

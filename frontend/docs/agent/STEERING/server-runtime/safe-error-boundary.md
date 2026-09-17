# Keep public errors safe

Scope: errors that cross from this service to a client, including route error UI and tRPC responses.

Why: internal failures can contain provider details and secrets.

## Do's

### Preserve the cause and use a fixed public message

This mapper uses the existing safe health-check message. Keep `cause` for internal diagnosis. Throw the mapped error only at the Promise boundary, as in [server neverthrow](server-neverthrow.md).

```ts
import { TRPCError } from "@trpc/server";

import { BACKEND_HEALTH_CHECK_FAILURE_MESSAGE } from "#/domains/products/products-router.mod.server";

export const mapHealthFailure = (cause: unknown) =>
  new TRPCError({
    cause,
    code: "BAD_GATEWAY",
    message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  });
```

Do not serialize `cause`, raw errors, or stacks into responses or route error UI. Log only approved, redacted diagnostic fields. Never log credentials, storage keys, or signed URLs. Do not dump the raw error, request, or response body into logs.

Health outbound failures map to safe `BAD_GATEWAY`. Workflow status `400`, `404`, `408`, `409`, `413`, `415`, `422`, and `503` maps respectively to `BAD_REQUEST`, `NOT_FOUND`, `TIMEOUT`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `UNPROCESSABLE_CONTENT`, and `SERVICE_UNAVAILABLE`. Ky timeouts map to `TIMEOUT`; invalid success/error JSON and other upstream failures map to `BAD_GATEWAY`. Input validators throw, not return errors as data.

## Don'ts

### Do not use upstream text as the public message

This mapper preserves `cause`, but it also exposes provider-controlled text. That text can contain credentials, keys, signed URLs, or request IDs. None belongs in the public message.

```ts
import { TRPCError } from "@trpc/server";

export const mapHealthFailure = (cause: unknown) =>
  new TRPCError({
    cause,
    code: "BAD_GATEWAY",
    message: cause instanceof Error ? cause.message : String(cause),
  });
```

# Use request-scoped backend HTTP clients

Scope: backend calls from server code.

Why: bindings supply the validated destination and finite transport policy; the caller supplies cancellation.

## Do's

### Reuse the bound client, relative route, signal, and finite policy

Read `httpClient` for health and `workflowHttpClient` for file work from `getAppBindings()`. Both use the validated `BACKEND_URL`. The [transport reference](../../../AGENTS.md#current-backend-transport) records the exact timeouts and retry limits. Extend a client only for a use case that needs a different policy; do not recreate clients downstream.

For example, inside `dryRun` in `wizard-router.mod.server.ts`, the existing `input`, `signal`, imports, and failure mapper support this bounded operation:

```ts
const { workflowHttpClient } = getAppBindings();
return ResultAsync.fromPromise(
  workflowHttpClient
    .post("/api/files/dry-run", {
      json: input,
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
      signal: signal ?? null,
      timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
      totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    })
    .json(contracts.dryRunResponseSchema),
  (cause: unknown) => cause,
)
  .mapErr((cause) => mapWorkflowRequestFailure(cause, DRY_RUN_FAILURE_MESSAGE))
  .match(
    (response) => response,
    (error) => {
      throw error;
    },
  );
```

The asynchronous `.mapErr` uses the real mapper to preserve the original cause inside a safe `TRPCError`; `.match` only returns success or throws that mapped error at the framework boundary. The existing `mapWorkflowRequestFailure` still contains `async`/`await` and must migrate to `neverthrow` when that production path is changed. This documentation-only example demonstrates composition, not compliance of the entire existing transitive server path.

Do not override the server-directed retry policy with client backoff or jitter. See [server failure handling](server-neverthrow.md) for mapping at the operation and throwing once at the boundary.

## Don'ts

### Do not bypass bindings, cancellation, or finite limits

This one-off request bypasses the bound host and signal and disables the timeout:

```ts
import ky from "ky";

ky.get("https://backend.internal/api/files/config", { timeout: false });
```

Static backend hosts belong only in tests and the validated environment module. `metadata-scrubber/no-hardcoded-backend-host` enforces that restriction.

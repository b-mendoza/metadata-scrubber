# Decided frontend conventions

This file records the frontend patterns the project chose.
Follow these choices in new and changed code.
Report code that conflicts with a choice instead of copying that code.

## Server code

Keep the frontend server a small proxy to the Go backend.
Use TanStack Start route handlers and server functions for small operations.

Write each backend call in its own procedure. That procedure owns the request contract and how failures become errors.

```ts
createUpload: publicProcedure
  .input(contracts.uploadInputSchema)
  .mutation(async ({ input, signal }) => {
    const { workflowHttpClient } = getAppBindings();
    const responseResult = await ResultAsync.fromPromise(
      workflowHttpClient
        .post("/api/uploads", {
          json: input,
          signal: signal ?? null,
        })
        .json(contracts.uploadResponseSchema),
      mapWorkflowRequestFailure(CREATE_UPLOAD_FAILURE_MESSAGE),
    );
    if (responseResult.isErr()) {
      throw responseResult.error;
    }
    return responseResult.value;
  }),
```

Do not add a shared transport wrapper that many procedures call:

```ts
const requestWorkflow = <T>(path: string, schema: z.ZodType<T>, input: unknown) =>
  workflowHttpClient.post(path, { json: input }).json(schema);

createUpload: publicProcedure.input(contracts.uploadInputSchema).mutation(({ input }) =>
  requestWorkflow("/api/uploads", contracts.uploadResponseSchema, input),
),
```

Create server clients in `appBindingsMiddleware` for each request. Read them with `getAppBindings()`.

```ts
export const appBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (options) => {
  const safeEnvironmentVariables = environmentSchema.parse(process.env);
  const httpClient = createHttpClient(safeEnvironmentVariables.BACKEND_URL);
  const workflowHttpClient = createWorkflowHttpClient(
    safeEnvironmentVariables.BACKEND_URL,
    options.request.headers,
  );

  return AppBindingsStore.run(
    {
      httpClient,
      posthogProjectToken: safeEnvironmentVariables.POSTHOG_PROJECT_TOKEN,
      workflowHttpClient,
    },
    options.next,
  );
});
```

Wrap server-only functions exported from modules without the `.server` suffix with `createServerOnlyFn`.
This prevents a browser from executing the server implementation.

```ts
export const getAppBindings = createServerOnlyFn(() => {
  const store = AppBindingsStore.getStore();
  invariant(store != null, "Failed to retrieve app bindings store");
  return store;
});
```

Pass the request `AbortSignal` to each backend HTTP call.

```ts
httpClient.get("/api/health", { signal: signal ?? null });
```

Change timeout or retry policy only for the use case that needs it. Set the change on that request.

```ts
workflowHttpClient.post("/api/files/dry-run", {
  json: input,
  retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  signal: signal ?? null,
  timeout: 90_000,
  totalTimeout: 90_000,
});
```

Do not change the shared client factory for one operation:

```ts
return ky.create({
  baseUrl,
  retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  timeout: 90_000,
  totalTimeout: 90_000,
});
```

Keep these limits when you replace Ky or Zod. A replacement must not run longer or accept new protocols.

```ts
ky.create({
  baseUrl,
  retry: {
    backoffLimit: 250,
    limit: 1,
    maxRetryAfter: 250,
    retryOnTimeout: false,
  },
  timeout: 3000,
  totalTimeout: 5000,
});

ky.create({
  baseUrl,
  retry: 0,
  timeout: 10_000,
  totalTimeout: 10_000,
});

z.url({ protocol: /^https?$/v });
```

## Errors and asynchronous code

Use `async`/`await` in each file where the import rules block `neverthrow`.

Map one dependency failure with `ResultAsync.fromPromise`. Await the result, check `isErr()`, and throw at the tRPC boundary.

```ts
const backendHealthStatusResult = await ResultAsync.fromPromise(
  httpClient
    .get("/api/health", {
      signal: signal ?? null,
    })
    .json(messageResponseSchema),
  (cause: unknown) =>
    new TRPCError({
      cause,
      code: "BAD_GATEWAY",
      message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
    }),
);

if (backendHealthStatusResult.isErr()) {
  throw backendHealthStatusResult.error;
}

return backendHealthStatusResult.value;
```

Use `.validate()` when only the yes-or-no result matters. It stops at the first failure and does not collect issues. `zod/prefer-validate` cannot trace a schema that another module exports, so check those calls yourself.

```ts
if (
  cause instanceof HTTPError &&
  contracts.backendErrorResponseSchema.validate(cause.data)
) {
  code = backendStatusCodes[cause.response.status] ?? "BAD_GATEWAY";
}
```

Leave schema checks with tRPC `.input()` when that API handles the call.

Do not parse the same success body again after Ky returns.

Let a direct `.parse()` at a boundary throw unless the handler maps that failure.
Handle every `Result` and awaited `ResultAsync`. Thenable lint checks do not prove that the code reads the inner result.

```ts
const responseResult = await ResultAsync.fromPromise(/* ... */);
if (responseResult.isErr()) {
  throw responseResult.error;
}
return responseResult.value;
```

## Route data

Treat every piece of route data as optional. Optional data can prefetch in the `loader`. The route can render before the query finishes.

Read query data with `useSuspenseQuery` only.
Put the fetch in a child component. Wrap that child in a `Suspense` boundary. Put the loading UI in the `fallback`.
The route then shows a static shell first. The shell is the page content that does not wait for the query. The user can use the page while data loads. If the route waits for the query, LCP, INP, and CLS can get worse. Those three names are Core Web Vitals.

```tsx
function IndexRoute() {
  return (
    <>
      <h1>Hello, world!</h1>

      <Suspense fallback={<div>Loading...</div>}>
        <Message />
      </Suspense>
    </>
  );
}

const Message = () => {
  const { trpc } = Route.useRouteContext();
  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  return <div>{messageQuery.data.status}</div>;
};
```

Read parent `Suspense` and error boundaries, including parents in other files, before you add a loader. Import rules cannot check those relationships.

Do not mark route query data as required. The operator decides that.

Read `trpc` and `queryClient` from loader context in a `loader`.
In a route file, the route component and any regular component in that file read both clients from `Route.useRouteContext()`.
This keeps consumers on the shared clients and cache.

```tsx
const Message = () => {
  const { trpc, queryClient } = Route.useRouteContext();
  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  return <div>{messageQuery.data.status}</div>;
};
```

When a component lives in its own file, import `trpcContext` and `useQueryClient`.
These hooks read the same clients and cache.

```tsx
import { useQueryClient } from "@tanstack/react-query";

import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

const Example = () => {
  const queryClient = useQueryClient();
  const trpc = trpcContext.useTRPC();

  const onClick = () => {
    void queryClient.invalidateQueries(trpc.products.getMessage.queryOptions());
  };

  return <button onClick={onClick}>Invalidate</button>;
};
```

## Contracts

Use Zod for validation in application code and tools.
Treat dependency and tool output as `unknown` until a schema checks it. A type name does not check external data.

```ts
const safeEnvironmentVariables = environmentSchema.parse(process.env);

const config = await workflowHttpClient
  .get("/api/files/config", { signal: signal ?? null })
  .json(workflowConfigResponseSchema);
```

Do not trust a type name or a cast:

```ts
type WorkflowConfigResponse = { maxFileSizeBytes: number };

const config = (await response.json()) as WorkflowConfigResponse;
return config.maxFileSizeBytes;
```

Read the maximum source size from the backend at runtime. The backend owns that limit.

```tsx
const { maxFileSizeBytes } = useSuspenseQuery(
  trpc.wizard.getWorkflowConfig.queryOptions(),
).data;

return (
  <FileUploader
    createUpload={createUpload}
    maxFileSizeBytes={maxFileSizeBytes}
    onUploadComplete={onUploadComplete}
  />
);
```

Do not add a frontend upper-limit constant or a schema `.max()` for that size.

```ts
const FRONTEND_MAX_FILE_SIZE_BYTES = 7_340_032;

fileSizeBytes: z.int().max(FRONTEND_MAX_FILE_SIZE_BYTES),
```

Reject padding before `.trim()` for exact contract strings. Accepted strings must keep their original value.

```ts
const fileNameSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    error: "The file name must not start or end with whitespace.",
  })
  .trim();
```

Do not trim first and accept padded strings:

```ts
const fileNameSchema = z.string().trim().min(1);
```

## Tests

Export a schema-derived type beside its schema when tests need it.

```ts
export const backendErrorResponseSchema = z.object({
  error: z.string().trim().nonempty(),
});

export type BackendErrorResponse = z.output<typeof backendErrorResponseSchema>;
```

```ts
const response: BackendErrorResponse = {
  error: "processing capacity temporarily unavailable",
};
```

Call tRPC procedures through `createCallerFactory` with the real router type.

```ts
const createAppCaller = createCallerFactory(appRouter);

const caller = createAppCaller(createTRPCRequestContext(request), {
  signal: request.signal,
}).wizard;

const config = await caller.getWorkflowConfig();
```

Do not call a procedure through a string path that drops router inference.

```ts
await caller.query("wizard.getWorkflowConfig");
```

Use MSW at network boundaries in unit tests. Keep request construction and response handling in the test.

Read or clone the request body inside the MSW handler. Ky can consume the body before a later assertion reads it.

```ts
const backendBodies: unknown[] = [];
const handler = vi.fn<HttpResponseResolver>(
  async ({ request: backendRequest }) => {
    backendBodies.push(await backendRequest.json());
    return HttpResponse.json(response);
  },
);
server.use(http.post("https://backend.test/api/uploads", handler));

await callerForRequest(request).createUpload(input);

expect(handler).toHaveBeenCalledOnce();
expect(backendBodies[0]).toEqual(input);
```

Keep a direct fetch fake only when MSW cannot keep the behavior, such as an exact injected error or a timeout that stays the same.

```ts
const transportFailure = new Error("provider-credential-sentinel");
const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(transportFailure);
vi.stubGlobal("fetch", fetchMock);
```

Capture a rejected error, then narrow it once with `expect.assert` before assertions that always run. Apply this in test helpers too.

```ts
let failure: unknown = null;
try {
  await caller.createUpload(input);
} catch (error) {
  failure = error;
}

expect.assert(failure instanceof TRPCError);
expect(failure.code).toBe("BAD_GATEWAY");
expect(failure.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
```

```ts
expect.assert(fileInput instanceof HTMLInputElement);
return fileInput;
```

Run end-to-end tests against the real frontend and backend services. Start both services before the suite. The suite starts no services and uses no mocks.

```ts
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
});
```

## Components and functions

Remount `FileUploader` when `createUpload` or `maxFileSizeBytes` changes. Its Effect captures those values on mount. `createUploadKey` is any value that changes when `createUpload` changes.

```tsx
<FileUploader
  key={`${maxFileSizeBytes}:${createUploadKey}`}
  createUpload={createUpload}
  maxFileSizeBytes={maxFileSizeBytes}
  onUploadComplete={onUploadComplete}
/>
```

Do not only change props on the same mounted instance.

```tsx
<FileUploader
  createUpload={createUpload}
  maxFileSizeBytes={maxFileSizeBytes}
  onUploadComplete={onUploadComplete}
/>
```

Name Effect hooks for the work they keep in sync, not for mount timing.

```ts
const useUppyDashboard = (props: FileUploaderProps) => {
  const getInitialProps = useEffectEvent(() => props);

  useEffect(() => {
    const { maxFileSizeBytes } = getInitialProps();
    const instance = new Uppy({
      restrictions: { maxFileSize: maxFileSizeBytes },
    });
    return () => {
      instance.destroy();
    };
  }, []);
};
```

Keep anonymous callbacks inline when you pass or store them.

```ts
void queryClient
  .query(trpc.products.getMessage.queryOptions())
  .catch(() => null);
```

## File names

Name server-only modules `*.mod.server.ts`. The server suffix keeps them out of browser bundles.
Name tests `*.test.ts` or `*.test.tsx`. Use `*.server.test.ts` for server tests so Vitest runs them in Node instead of a DOM environment.
Keep only setup and shared helpers in `src/tests/`. The colocated-test check skips that directory.

Regenerate `src/routeTree.gen.ts` after route changes. Do not edit that file.

## Lint rules and checks

Leave `.oxlintrc.json` unchanged. The user owns rule activation in Oxlint. Put agent rule changes in the ESLint configuration.

When you add a Vitest discovery pattern, check that the ESLint test patterns cover it. Add a pattern only when the existing patterns do not cover it.

Keep React Doctor checks on the full frontend with the configured ignored paths. A changed-file scan can miss relationships between files.

Put each new ESLint rule in the configuration module for its topic. This keeps related policy together.

Register custom rules in `oxlint-plugin-metadata-scrubber/index.ts`. Enable them in `fixture.config.json` and `eslint-config/metadata-scrubber-rules.ts`. These entries give the fixture check and ESLint the same rules.

Resolve bindings through `sourceCode.getScope` and resolved references. Spelling alone misses aliases and shadowing.

Add a positive fixture and a negative fixture for each custom rule. Keep the exact count and ordered messages in `oxlint-plugin-metadata-scrubber/fixture-cases.ts`. These expectations check which code the rule accepts and rejects.

Name the failing binding or source and the exact repair API or import path in each error message. This makes the correction specific to the failure.

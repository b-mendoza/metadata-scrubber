# Decided frontend conventions

This file records the frontend patterns the project chose.
Follow these choices in new and changed code.
Report code that conflicts with a choice instead of copying that code.

## Imports

Import from `src/` with `#/`. The alias does not depend on the caller's directory.

```ts
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";
```

Do not use a relative path into `src/`:

```ts
import { getAppBindings } from "../../shared/middlewares/app-bindings/app-bindings.mod";
```

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

Do not store a client in a module-level `const`. That client can share state between requests.

```ts
const workflowHttpClient = createWorkflowHttpClient(backendUrl);
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

Pass the request `AbortSignal` to each backend HTTP call. Use a relative path after app bindings set the base URL.

```ts
httpClient.get("/api/health", { signal: signal ?? null });
```

Do not rebuild the backend origin in the procedure:

```ts
httpClient.get(`${backendUrl}/api/health`, { signal });
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

Keep `neverthrow` in non-test `.server` modules under `src/` and in `scripts/`.
Use `async`/`await` in other source files and in tests.
This keeps the result library out of browser code.

```ts
import { ResultAsync } from "neverthrow";

const backendHealthStatusResult = await ResultAsync.fromPromise(
  httpClient
    .get("/api/health", { signal: signal ?? null })
    .json(messageResponseSchema),
  (cause: unknown) =>
    new TRPCError({
      cause,
      code: "BAD_GATEWAY",
      message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
    }),
);
```

```tsx
const messageQuery = useSuspenseQuery(trpc.products.getMessage.queryOptions());
```

Do not import `neverthrow` in a route, component, or test.

```tsx
import { ResultAsync } from "neverthrow";

const messageQuery = useSuspenseQuery(trpc.products.getMessage.queryOptions());
```

`scripts/hard-clean.ts` and `scripts/soft-clean.ts` must run without installed dependencies. Use Node built-ins only.

```ts
import { rm } from "node:fs/promises";

await Promise.all(
  PATHS.map(async (path) =>
    rm(path, {
      force: true,
      recursive: true,
    }),
  ),
);
```

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

Do not wrap the whole handler in `try`/`catch`. That map would also catch programming errors.

```ts
try {
  return await httpClient
    .get("/api/health", {
      signal: signal ?? null,
    })
    .json(messageResponseSchema);
} catch (cause) {
  throw new TRPCError({
    cause,
    code: "BAD_GATEWAY",
    message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  });
}
```

Use `safeParse` when you check a value without throwing. Then branch on `success`.

```ts
if (
  cause instanceof HTTPError &&
  contracts.backendErrorResponseSchema.safeParse(cause.data).success
) {
  code = backendStatusCodes[cause.response.status] ?? "BAD_GATEWAY";
}
```

Leave schema checks with tRPC `.input()` and Ky `.json()` when those APIs handle the call.

```ts
publicProcedure.input(contracts.uploadInputSchema).mutation(async ({ input, signal }) => {
  const responseResult = await ResultAsync.fromPromise(
    workflowHttpClient
      .post("/api/uploads", { json: input, signal: signal ?? null })
      .json(contracts.uploadResponseSchema),
    mapWorkflowRequestFailure(CREATE_UPLOAD_FAILURE_MESSAGE),
  );
```

Do not parse the same success body again after Ky returns:

```ts
const raw = await workflowHttpClient
  .post("/api/uploads", { json: input })
  .json();
return contracts.uploadResponseSchema.parse(raw);
```

Let a direct `.parse()` at a boundary throw unless the handler maps that failure.
Handle every `Result` and awaited `ResultAsync`. Thenable lint checks do not prove that the code reads the inner result.

```ts
const responseResult = await ResultAsync.fromPromise(/* ... */);
if (responseResult.isErr()) {
  throw responseResult.error;
}
return responseResult.value;
```

Do not ignore the inner result:

```ts
await ResultAsync.fromPromise(/* ... */);
```

## Route data

Treat every piece of route data as optional. Optional data can prefetch in the `loader`. The route can render before the query finishes. TanStack Query calls this prefetching: fill the cache ahead of time and do not wait for the result. See [Prefetching & Router Integration](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching).
Start each query in the `loader` without waiting. Do not return that promise. The `.catch` stops a promise error that no other code handles.

```ts
export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader({ context }) {
    const { queryClient, trpc } = context;

    void queryClient
      .query(trpc.products.getMessage.queryOptions())
      .catch(() => null);
  },
});
```

Do not `await` the query in the `loader`. The user cannot move to another route until every waiting request finishes.

```ts
await queryClient.query(trpc.products.getMessage.queryOptions());
```

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

Do not mark route data as required. The operator decides that.
An agent may await a first fetch only when a later fetch needs that result. Keep the later fetches optional. `firstQueryOptions` and `laterQueryOptions` are placeholders. This app has no such queries today.

```ts
async loader({ context }) {
  const { queryClient } = context;
  const required = await queryClient.ensureQueryData(firstQueryOptions);

  void queryClient
    .query(laterQueryOptions(required))
    .catch(() => null);
}
```

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

Do not import `trpcContext` in a route file.

```tsx
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

const Message = () => {
  const trpc = trpcContext.useTRPC();
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

Pass `trpc` and `queryClient` as props only during `TRPCProvider` setup.

```tsx
<trpcContext.TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
  {children}
</trpcContext.TRPCProvider>
```

Do not pass these clients to child components.

```tsx
<Message trpc={trpc} queryClient={queryClient} />
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

Do not write a parallel test-only type:

```ts
type BackendErrorResponse = { error: string };
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
Set `onUnhandledFrame` to `"error"` and reset handlers after each test.

```ts
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
```

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

Do not read `handlerInfo.request.json()` after Ky has already consumed the body.

Keep a direct fetch fake only when MSW cannot keep the behavior, such as an exact injected error or a timeout that stays the same.

```ts
const transportFailure = new Error("provider-credential-sentinel");
const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(transportFailure);
vi.stubGlobal("fetch", fetchMock);
```

Do not use MSW to replace a running service in end-to-end tests.

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

Do not use a Boolean matcher when you need TypeScript narrowing on the same value.

```ts
expect(failure instanceof TRPCError).toBe(true);
expect(failure.code).toBe("BAD_GATEWAY");
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

Do not name the hook for mount timing.

```ts
const useMount = (callback: () => void) => {
  useEffect(callback, []);
};
```

Call a named function instead of an immediately invoked function. Keep anonymous callbacks inline when you pass or store them.

```ts
const loadInitialMessage = () => {
  void queryClient.query(trpc.products.getMessage.queryOptions());
};

loadInitialMessage();
```

```ts
void queryClient
  .query(trpc.products.getMessage.queryOptions())
  .catch(() => null);
```

Do not wrap a one-off call in an immediately invoked function.

```ts
(() => {
  void queryClient.query(trpc.products.getMessage.queryOptions());
})();
```

## File names

Name source modules `*.mod.ts`, or `*.mod.tsx` when they contain JSX. This distinguishes modules from route entry points.
Name server-only modules `*.mod.server.ts`. The server suffix keeps them out of browser bundles.
Name tests `*.test.ts` or `*.test.tsx`. Use `*.server.test.ts` for server tests so Vitest runs them in Node instead of a DOM environment.
Put each test beside its module. Keep `src/tests/` for setup and shared helpers. This keeps behavior tests beside the code they check.

```
src/domains/products/products-router.mod.server.ts
src/domains/products/products-router.mod.server.test.ts
src/domains/wizard/components/file-uploader/file-uploader.mod.tsx
src/domains/wizard/components/file-uploader/file-uploader.mod.test.tsx
src/routes/index.tsx
src/tests/setup-test-environment.ts
src/tests/utils/file-input/file-input.mod.ts
```

Regenerate `src/routeTree.gen.ts` after route changes. Do not edit that file.

## Lint rules and checks

Leave `.oxlintrc.json` unchanged. The user owns updates that turn rules on. Put agent rule changes in the ESLint configuration.

When you add a test file pattern to `vitest.config.ts`, add the same pattern to `eslint-config/test-rules.ts`. The `*.integration.test.ts` glob below is an example of a new category. This repo does not use that suffix today.

```ts
include: ["./src/**/*.server.test.ts", "./src/**/*.integration.test.ts"],
```

```ts
files: [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/**/*.integration.test.ts",
],
```

Keep React Doctor checks on the full frontend with the configured ignored paths. A changed-file scan can miss cross-file problems.

Put each new ESLint rule in the configuration module for its topic.

```ts
// eslint-config/react-rules.ts
[`${PLUGIN_NAMES.ESLintReact}/globals`]: SEVERITY_LEVELS.Error,

// eslint-config/test-rules.ts
[`${PLUGIN_NAMES.Vitest}/no-conditional-tests`]: SEVERITY_LEVELS.Error,
```

Create a custom rule with `defineRule`. Put message templates in `meta.messages`. Report with `messageId` and `data`.

```ts
export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require plain functions and objects instead of class declarations.",
    },
    messages: {
      classSyntax:
        "`{{ className }}` uses class syntax. Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object.",
    },
  },
  create(context) {
    return {
      ClassDeclaration(node) {
        context.report({
          node,
          messageId: "classSyntax",
          data: { className: node.id?.name ?? "anonymous class" },
        });
      },
    };
  },
});
```

Register the rule in `oxlint-plugin-metadata-scrubber/index.ts`. Enable it in `oxlint-plugin-metadata-scrubber/fixture.config.json` and `eslint-config/metadata-scrubber-rules.ts`.

```ts
rules: {
  "no-classes": noClasses,
}
```

```json
{
  "rules": {
    "metadata-scrubber/no-classes": "error"
  }
}
```

```ts
[`${PLUGIN_NAMES.MetadataScrubber}/no-classes`]: SEVERITY_LEVELS.Error,
```

Resolve bindings through `sourceCode.getScope` and resolved references. Spelling alone misses aliases and shadowing.

```ts
let scope: Scope | null = sourceCode.getScope(node);
while (scope != null) {
  const reference = scope.references.find(
    (candidate) => candidate.identifier === node,
  );
  if (reference != null) return reference.resolved;
  scope = scope.upper;
}
```

Do not match a name with a string compare only:

```ts
if (node.name === "expectTypeOf") {
  context.report({ node, messageId: "staticTypeAssertion" });
}
```

Add a positive fixture and a negative fixture for each custom rule. Set the exact count and ordered messages in `oxlint-plugin-metadata-scrubber/check-fixtures.ts`.

```ts
[
  "no-classes",
  "no-classes.ts",
  [
    `\`Service\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
    `\`ServiceExpression\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
    `\`ServiceError\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
  ],
],
```

Name the failing binding or source and the exact repair API or import path in each error message. Include every repair step. Name each known bypass only to forbid it when that bypass still breaks the rule.

```ts
"`{{ className }}` uses class syntax. Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. The rule has no class exceptions, including classes that extend `Error`.";
```

Do not write a short label with no repair.

```ts
"Do not use a class.";
```

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

Split type imports from runtime imports. Type-only imports do not run the module.

```ts
import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
```

Do not mix inline `type` specifiers into a runtime import:

```ts
import ky, { type KyInstance, HTTPError } from "ky";
```

Review what a module does when it first loads before you remove the last runtime import. Keep a side-effect import when that first load must run.

```ts
import type { Matcher } from "./register-matchers.mod";
import "./register-matchers.mod";
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

- Keep `neverthrow` in non-test `.server` modules under `src/` and in `scripts/`. Use `async`/`await` in other source files and in tests. This keeps the result library out of browser code.
- Use `async`/`await` without the result library in `scripts/hard-clean.ts` and `scripts/soft-clean.ts`. These scripts must run without installed dependencies.
- Use `ResultAsync.fromPromise` when a server handler maps a dependency failure. Map the failure at that one operation. Do not wrap the whole handler. This keeps other programming errors out of that map.
- Follow the `getMessage` failure pattern in `src/domains/products/products-router.mod.server.ts`. Await the `ResultAsync`, check `isErr()`, and throw its error at the route or tRPC boundary before returning its value. These checks make the failure easy to see.

```ts
const backendHealthStatusResult = await ResultAsync.fromPromise(
  httpClient
    .get(BACKEND_HEALTH_STATUS_ENDPOINT, {
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

Do not catch the dependency failure around the whole handler:

```ts
try {
  return await httpClient
    .get(BACKEND_HEALTH_STATUS_ENDPOINT, {
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

| API                       | Use it when                                                                  | Example                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `ResultAsync.fromPromise` | Map a failed promise to a known error. Keep the original failure in `cause`. | `src/domains/products/products-router.mod.server.ts`, `getMessage`            |
| `isErr()`                 | Check a result before you read its error or value.                           | `src/domains/products/products-router.mod.server.ts`, `getMessage`            |
| `safeParse`               | Check a value without throwing. Then branch on `success`.                    | `src/domains/wizard/wizard-router.mod.server.ts`, `mapWorkflowRequestFailure` |

- Leave schema checks with tRPC `.input()` and Ky `.json()` when those APIs handle the call. Let direct `.parse()` calls at a boundary throw unless the handler maps their failure. A second wrapper would add a second place that handles the failure.
- Review unused `Result` values and awaited `ResultAsync` values when the code ignores the inner result. Thenable lint checks do not prove that the code handles the result.

## Route data

- Treat every piece of route data as optional.
- Do not `await` a data request in a `loader`. If the `loader` waits, the user cannot move to another route. A user who opens the app from another site also waits. The route cannot render until every waiting request finishes.
- Start each query without waiting. Do not return that promise from the `loader`. The `.catch` stops a promise error that no other code handles. The component that reads the query uses the cache.

Loader:

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader(loaderFunctionContext) {
    const { queryClient, trpc } = loaderFunctionContext.context;

    void queryClient
      .query(trpc.products.getMessage.queryOptions())
      .catch(() => null);
  },
});
```

Do not await the query:

```ts
await queryClient.query(trpc.products.getMessage.queryOptions());
```

- Read query data with `useSuspenseQuery` only. Do not use `useQuery`.
- Put the data fetch in a child component. Wrap that child in a `Suspense` boundary with a `fallback`. The route then shows a static shell first. The shell is the page content that does not wait for the query. The user can use the page while data loads. This stops LCP, INP, and CLS from getting worse. Those names are page-speed scores.
- Put the loading UI in the `fallback`. Do not use loading flags. Do not write extra checks for missing data while it loads.

```tsx
import { Suspense } from "react";

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
```

Do not read the query with `useQuery`:

```tsx
const messageQuery = useQuery(trpc.products.getMessage.queryOptions());
```

- Review the actual parent `Suspense` and error boundaries, data needs, and retry behavior. Include parents in other files. Add a loader only when the route needs one. Import rules cannot check these relationships.
- Do not mark route data as required. The operator decides that. An agent may mark data as required only when a later fetch needs that first result. Await only that first fetch. Keep the later fetches optional.

A page that needs a signed-in user first fetches that user's data. Later fetches use that user. The user fetch is required. The later fetches stay optional.

- Read `trpc` and `queryClient` from loader context in a `loader`.
- One route file must use one source for the clients. In that file, a route component and any regular component (for example `Message` in `src/routes/index.tsx`) must read both clients from `Route.useRouteContext()`. Do not import `trpcContext` in a route file.

```tsx
const Message = () => {
  const { trpc, queryClient } = Route.useRouteContext();

  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  const message = messageQuery.data.status;

  return <div>{message}</div>;
};
```

Do not import `trpcContext` in a route file:

```tsx
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

const Message = () => {
  const trpc = trpcContext.useTRPC();
```

- When a component lives in its own file, not a route file, import `trpcContext` from `#/shared/libs/trpc/client/client-runtime.mod` and call `trpcContext.useTRPC()`. Import `useQueryClient` from `@tanstack/react-query` when that file needs `queryClient`.

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

- Pass `trpc` and `queryClient` as props only during `TRPCProvider` setup. Do not pass these clients to child components.

Do not pass the clients to a child as props:

```tsx
<Message trpc={trpc} queryClient={queryClient} />
```

## Contracts

- Use Zod for validation in application code and tools. One validation library keeps schema behavior the same everywhere.
- Treat dependency and tool output as `unknown` before you check it with Zod. A type name alone does not check external data.
- Read the maximum source size from the backend at runtime. Do not add a frontend upper-limit constant or `.max()` check. The backend owns that limit.
- Reject padding before `.trim()` for exact contract strings. Accepted strings must keep their original value.

## Tests

- Export a schema-derived type beside its schema when tests need it. Tests then use the production contract.
- Call tRPC procedures through `createCallerFactory` with the real router type. Reflection would lose the typed input and output checks.
- Use MSW at network boundaries in unit tests to model real responses with less test setup code. Keep request construction and response handling in the test. Keep a direct fake only when it keeps behavior that MSW cannot test, such as exact injected errors or timeouts that stay the same. Do not use MSW to replace a running service in end-to-end tests.
- Set MSW's `onUnhandledFrame` to `"error"` and reset handlers after each test. Check handler calls in failure tests so a missing handler cannot pass as the expected request failure.
- Read or clone request bodies inside the MSW handler or the kept fetch fake. Ky can read the body before a later assertion reads it.
- Capture a rejected error, then narrow it once with `expect.assert` before assertions that always run. Apply this pattern in test helpers too. Conditional-expect lint does not check every helper.
- Use `expect.assert` when a first assertion must narrow a TypeScript type. A Boolean matcher does not give that narrowing.
- Keep Vitest's failure for empty test discovery enabled. A suite with no tests must not pass.
- Run end-to-end tests against the real frontend and backend services, not mocks. Mocks can produce false passes and false failures.
- Start both services before running end-to-end tests. The suite starts no services.

## Components and functions

- Remount `FileUploader` when `createUpload` or `maxFileSizeBytes` changes. Its Effect captures those values on mount.
- Name Effect hooks for the work they keep in sync, not for mount timing. The hook-name check cannot prove that the name describes the work.
- Call a named function instead of an immediately invoked function. Keep anonymous callbacks inline when passing or storing them. This gives each immediate call a name without moving callbacks away from their use.

## File names

- Name source modules `*.mod.ts`, or `*.mod.tsx` when they contain JSX. This marks modules as different from route files.
- Name server-only modules `*.mod.server.ts`. The server suffix keeps them out of browser bundles.
- Name tests `*.test.ts` or `*.test.tsx`. Use `*.server.test.ts` for server tests so Vitest runs them in Node instead of a DOM environment.
- Put each test beside its module. Keep `src/tests/` for setup and shared helpers. This keeps behavior tests beside the code they check.
- Regenerate `src/routeTree.gen.ts` after route changes instead of editing it. The route generator replaces manual changes.

## Lint rules and checks

- Leave `.oxlintrc.json` unchanged. The user owns updates that turn rules on. Agent rule changes belong in the ESLint configuration.
- Update `eslint-config/test-rules.ts` when adding a test category to `vitest.config.ts`. New test discovery needs matching lint coverage.
- Keep React Doctor checks scoped to the full frontend with the configured ignored paths. A changed-file scan can miss cross-file problems.
- Put each new ESLint rule in the configuration module for its topic. This keeps unrelated policies separate.
- Create custom rules with `defineRule` under `oxlint-plugin-metadata-scrubber/rules/`. Register them in `oxlint-plugin-metadata-scrubber/index.ts`. The plugin must make each rule available to the code that uses it.
- Enable each new custom rule in `oxlint-plugin-metadata-scrubber/fixture.config.json` and `eslint-config/metadata-scrubber-rules.ts`. Fixture checks and application lint must both run the rule.
- Define error message templates in `meta.messages`. Report with `messageId` and fill-in `data`. This keeps each error message in one place.
- Resolve bindings through `sourceCode.getScope` and resolved references. Spelling alone misses aliases and shadowing.
- Add positive and negative fixtures for each custom rule. Set the exact count and ordered messages in `oxlint-plugin-metadata-scrubber/check-fixtures.ts`. This detects missing and extra reports.
- Name the failing binding or source and the exact repair API or import path in each error message. Include every repair step. Name each known bypass only to forbid it when that bypass still breaks the rule. CLI output has no separate help channel.

# Decided frontend conventions

This file records the frontend patterns the project chose.
Follow these choices in new and changed code.
Report code that conflicts with a choice instead of copying that code.

## Imports

- Use `#/` for imports from `src/`. The alias does not depend on the caller's directory.
- Review module initialization before removing the last runtime import. Keep a side-effect import when initialization is required. Type-only imports do not execute the module.

The workflow Ky client uses this split:

```ts
import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
```

## Server code

- Keep the frontend server a thin proxy to the Go backend. Send small JSON contracts through tRPC procedures, not file bytes. Concurrent file buffers multiply memory use.
- Use TanStack Start route handlers and server functions for small operations. Another server framework would add a second request-handling model.
- Keep each backend call explicit in its procedure instead of adding a shared transport wrapper. Each operation owns its request contract and failure mapping.
- Create server clients in `appBindingsMiddleware` for each request. Read them with `getAppBindings()`. A module-level `const` client can share state between requests.
- Wrap server-only functions exported from modules without the `.server` suffix with `createServerOnlyFn`. This prevents a browser from executing the server implementation.
- Pass the request's `AbortSignal` to each backend HTTP call. Cancellation must stop backend work.
- Use relative paths for bound Ky calls. App bindings supply the base URL.
- Change a bound client's timeout or retry policy only for a use case that needs it. Set the change on that request so other operations keep their policy.
- Preserve attempt timeouts, total timeouts, retry counts, retry delay caps, and accepted URL protocols when replacing Ky or Zod. A replacement must not run longer or accept new protocols.

## Errors and asynchronous code

- Keep `neverthrow` in non-test `.server` modules under `src/` and in `scripts/`. Use `async`/`await` in other source files and in tests. This keeps the result library out of browser code.
- Use `async`/`await` without the result library in `scripts/hard-clean.ts` and `scripts/soft-clean.ts`. These scripts must run without installed dependencies.
- Use `ResultAsync.fromPromise` when a server handler intentionally maps a dependency failure. Map the failure at the operation, not around the whole handler. This keeps unrelated programming errors out of that mapping.
- Follow the `getMessage` failure pattern in `src/domains/products/products-router.mod.server.ts`. Await the `ResultAsync`, check `isErr()`, and throw its error at the route or tRPC boundary before returning its value. Explicit checks keep the failure path visible.

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

| API                       | Use it when                                                                          | Example                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `ResultAsync.fromPromise` | Map a promise rejection to a known error value with the original failure in `cause`. | `src/domains/products/products-router.mod.server.ts`, `getMessage`            |
| `isErr()`                 | Check a result before reading its error or value.                                    | `src/domains/products/products-router.mod.server.ts`, `getMessage`            |
| `safeParse`               | Validate a value without throwing and branch on `success`.                           | `src/domains/wizard/wizard-router.mod.server.ts`, `mapWorkflowRequestFailure` |

- Leave schema validation with tRPC `.input()` and Ky `.json()` when those APIs own the call. Let direct boundary `.parse()` calls throw unless the handler intentionally maps their failure. A second wrapper would add another failure owner.
- Review discarded synchronous `Result` values and awaited `ResultAsync` values whose inner result is ignored. Thenable lint checks do not prove that the code handles the result.

## Route data

- Treat loader data as optional unless the page cannot render without it. Await only required data. Optional requests must not block navigation.
- Await `queryClient.query` with `staleTime: "static"` for required cached query data. Let a rejection reach the router's error handling. Cached data can then satisfy the loader without another fetch.
- Start optional queries with `void queryClient.query(trpc.products.getMessage.queryOptions()).catch(() => null)`, as the index route does. Keep the loader synchronous. Do not await or return that promise. The catch prevents an unhandled rejection. The consumer reads the cache.
- Put each `useSuspenseQuery` consumer under an ancestor `Suspense` with a `fallback`. Put query loading UI there instead of loading flags or nullable-data branches in the consumer. The rest of the page can render while optional data loads.
- Review the actual parent Suspense and error boundaries, data needs, and retry behavior. Include parents in other files. Add a loader only when the route needs one. Import rules cannot check these relationships.
- Read `trpc` and `queryClient` from loader context in a `loader`.
- Read `trpc` from `Route.useRouteContext()` in a route component.
- In a child component, import `trpcContext` and call `trpcContext.useTRPC()` for the `trpc` client. Import `useQueryClient` from `@tanstack/react-query` when the child needs `queryClient`.
- Pass `trpc` and `queryClient` as props only during `TRPCProvider` setup. Do not pass these clients to child components.

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

Route component:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";

function IndexRoute() {
  const { trpc } = Route.useRouteContext();

  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  const message = messageQuery.data.status;

  return <div>{message}</div>;
}
```

Child component with `trpc`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";

import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

const Message = () => {
  const trpc = trpcContext.useTRPC();

  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  const message = messageQuery.data.status;

  return <div>{message}</div>;
};
```

Child component that also needs `queryClient`:

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

Do not pass the clients to a child as props:

```tsx
<Message trpc={trpc} queryClient={queryClient} />
```

## Contracts

- Use Zod for validation in application code and tools. One validation library keeps schema behavior consistent.
- Treat dependency and tool output as `unknown` before validating it with Zod. A type annotation alone does not check external data.
- Read the maximum source size from the backend at runtime. Do not add a frontend upper-limit constant or `.max()` check. The backend owns that limit.
- Reject padding before `.trim()` for exact contract strings. Accepted strings must keep their original value.

## Tests

- Export a schema-derived type beside its schema when tests need it. Tests then use the production contract.
- Call tRPC procedures through `createCallerFactory` with the real router type. Reflection would lose the typed input and output checks.
- Use MSW at network boundaries in unit tests to model realistic responses with less test setup code. Keep request construction and response handling in the test. Keep a direct fake only when it preserves behavior that MSW cannot test, such as exact injected errors or deterministic timeouts. Do not use MSW to replace a running service in end-to-end tests.
- Set MSW's `onUnhandledFrame` to `"error"` and reset handlers after each test. Check handler calls in failure tests so a missing handler cannot pass as the expected request failure.
- Read or clone request bodies inside the MSW handler or retained fetch fake. Ky can consume the body before a later assertion reads it.
- Capture a rejected error, then narrow it once with `expect.assert` before unconditional assertions. Apply this pattern in test helpers too. Conditional-expect lint does not check every helper.
- Use `expect.assert` when a prerequisite assertion must narrow a TypeScript type. A Boolean matcher does not supply that narrowing.
- Keep Vitest's failure for empty test discovery enabled. A suite with no tests must not pass.
- Run end-to-end tests against the real frontend and backend services, not mocks. Mocks can produce false passes and false failures.
- Start both services before running end-to-end tests. The suite starts no services.

## Components and functions

- Remount `FileUploader` when `createUpload` or `maxFileSizeBytes` changes. Its Effect captures those values on mount.
- Name Effect hooks for their synchronization purpose, not mount timing. The hook-name check cannot prove that the name describes the work.
- Call a named function instead of an immediately invoked function. Keep anonymous callbacks inline when passing or storing them. This gives each immediate call a name without moving callbacks away from their use.

## File names

- Name source modules `*.mod.ts`, or `*.mod.tsx` when they contain JSX. This distinguishes modules from route entry points.
- Name server-only modules `*.mod.server.ts`. The server suffix keeps them out of browser bundles.
- Name tests `*.test.ts` or `*.test.tsx`. Use `*.server.test.ts` for server tests so Vitest runs them in Node instead of a DOM environment.
- Put each test beside its module. Keep `src/tests/` for setup and shared helpers. This keeps behavior tests beside the code they check.
- Regenerate `src/routeTree.gen.ts` after route changes instead of editing it. The route generator replaces manual changes.

## Lint rules and checks

- Leave `.oxlintrc.json` unchanged. The user owns its activation updates; agent rule changes belong in the ESLint configuration.
- Update `eslint-config/test-rules.ts` when adding a test category to `vitest.config.ts`. New test discovery needs matching lint coverage.
- Keep React Doctor checks scoped to the full frontend with the configured exclusions. A changed-file scan can miss cross-file problems.
- Put each new ESLint rule in the configuration module for its topic. This keeps unrelated policies separate.
- Create custom rules with `defineRule` under `oxlint-plugin-metadata-scrubber/rules/`. Register them in `oxlint-plugin-metadata-scrubber/index.ts`. The plugin must expose each rule to its consumers.
- Enable each new custom rule in `oxlint-plugin-metadata-scrubber/fixture.config.json` and `eslint-config/metadata-scrubber-rules.ts`. Fixture checks and application lint must both exercise the rule.
- Define diagnostic templates in `meta.messages`. Report with `messageId` and interpolation `data`. This keeps each diagnostic's wording in one place.
- Resolve bindings through `sourceCode.getScope` and resolved references. Spelling alone misses aliases and shadowing.
- Add positive and negative fixtures for each custom rule. Pin the exact count and ordered messages in `oxlint-plugin-metadata-scrubber/check-fixtures.ts`. This detects missing and extra reports.
- Name the failing binding or source and the exact repair API or import path in each diagnostic. Include every repair step. Name each known bypass only to forbid it when it can preserve the violation. CLI output has no separate help channel.

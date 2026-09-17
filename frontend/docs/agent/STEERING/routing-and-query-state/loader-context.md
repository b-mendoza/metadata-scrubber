# Use the loader's context

Scope: route loaders and router initialization in this service.

Why: a loader must use its router's clients, not create a second cache.

## Do's

### Return the required query's Promise from the loader

Use the loader's `context` argument. This replacement loader in `src/routes/index.tsx` waits without `async/await`, including during SSR. Keep the route's component and other options.

```ts
import { createFileRoute } from "@tanstack/react-router";
import { ResultAsync } from "neverthrow";

export const Route = createFileRoute("/")({
  loader({ context }) {
    return ResultAsync.fromPromise(
      context.queryClient.query(
        context.trpc.products.getMessage.queryOptions(),
      ),
      (cause) => new Error("Could not load workflow status", { cause }),
    ).match(
      () => null,
      (error) => {
        throw error;
      },
    );
  },
});
```

`match` consumes both result variants and returns a Promise, which the loader returns so the router waits. `queryClient.query(options)` returns fresh cached data or fetches missing, stale, or invalidated data. A failed fetch reaches the loader's error boundary. Preserve the query's configured freshness policy instead of overriding it with `staleTime: "static"`, which accepts existing cached data even after invalidation.

This non-async boundary follows the server policy but encounters the [current lint conflict](../server-runtime/server-neverthrow.md#map-failures-at-the-operation-and-adapt-both-variants-once). Report that conflict instead of adding `async` or suppressing the rule.

### Build context only inside the existing router factory

`getRouterContext(trpcClient)` belongs only in `getRouter` in `src/router.tsx`. Each server call creates a fresh query client. The browser reuses its query client across renders.

This is an excerpt of the **existing `getRouter` body**, using that file's existing imports. Keep the provider and SSR integration on the same `routerContext.queryClient`.

```tsx
const trpcURL = getBaseTRPCURL();
const trpcClient = initializeTRPCClient(trpcURL);
const routerContext = getRouterContext(trpcClient);
const router = createRouter({
  context: { ...routerContext },
  defaultPreload: "viewport",
  routeTree,
  scrollRestoration: true,
  Wrap: (props: React.PropsWithChildren) => (
    <TRPCProvider
      queryClient={routerContext.queryClient}
      trpcClient={trpcClient}
    >
      {props.children}
    </TRPCProvider>
  ),
});
setupRouterSsrQueryIntegration({
  queryClient: routerContext.queryClient,
  router,
});
return router;
```

## Don'ts

### Do not replace the loader argument with a factory call

This binding inside a loader creates another context. It does not retrieve the active router's context. The factory imports come from `#/shared/libs/trpc/client/client.mod`.

```ts
const context = getRouterContext(initializeTRPCClient(getBaseTRPCURL()));
```

### Do not call React context hooks in a loader or server handler

This binding inside a loader calls a React hook outside a component or custom hook.

```ts
import { getRouteApi } from "@tanstack/react-router";

const context = getRouteApi("/").useRouteContext();
```

`useRouteContext` and `getRouteApi(...).useRouteContext()` are React hooks, not server context APIs. A component can use them during rendering, including SSR. Loaders use their argument; server handlers use their own request bindings. Do not invent an ambient router-context accessor.

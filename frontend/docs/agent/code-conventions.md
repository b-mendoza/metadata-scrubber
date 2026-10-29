# Frontend design practices

This guide describes general practices. The code is the source of truth. This guide does not override the code.

## Dependencies and failures

- Keep each operation on one purpose.
- Keep a dependency out of a runtime that does not need it. Check every path that can reach another runtime.
- Do not make tool users install dependencies they do not need.
- Report a failure in words the caller understands. Keep the original cause.
- Do not read a used-up resource again.
- Keep cleanup tools free of the files they delete.
- Report a failure at the boundary that owns it.
- Keep validation and failure handling under one owner.

## Data and resources

- Treat route data as optional. Do not `await` query data in a `loader`. The root loader may `await loadPostHogBrowserConfig()`. That value is not a TanStack Query.
- Fetch route data in a child component. Wrap that child in `Suspense`. Read the data with `useSuspenseQuery` only. Do not use `useQuery`.
- Only the operator marks route data as required. An agent may mark data as required only when a later fetch needs that first result.
- Follow the [frontend conventions](../conventions.md) for `trpc` and `queryClient` access. A `loader` or route component may read them from route context. A child must call `trpcContext.useTRPC()` and `useQueryClient`. Do not pass those clients as props except during `TRPCProvider` setup.

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
```

Do not wait in the `loader`:

```ts
await queryClient.query(trpc.products.getMessage.queryOptions());
```

- Stop work when its owner cancels it.
- Match resource creation and release to the lifetime of its owner.

## Changes and checks

- Keep program meaning when you change syntax.
- Keep limits and accepted inputs when you change dependencies.
- Reject invalid input. Do not change it in silence.
- Check external data against its real contract. Reject missing required data. Do not hide invalid input with a default.
- Do not let control flow skip a required check.
- Keep checks able to find failures. Do not shrink their scope to hide a failure.
- Keep automated-check coverage aligned with the code it must inspect.

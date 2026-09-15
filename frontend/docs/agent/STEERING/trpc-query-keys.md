# Pass complete tRPC query keys

Scope: query client operations that target tRPC data.

Why: `queryKey()` already returns the complete array. Another array prevents the intended cache match.

## Do's

### Pass the procedure key directly

These callback excerpts use `queryClient` from `useQueryClient` and `trpc` from `useTRPC`, as in [the component example](no-query-clients-in-props.md).

```ts
void queryClient.invalidateQueries({
  queryKey: trpc.products.getMessage.queryKey(),
});
```

Use the same direct key for `removeQueries`. Invalidation marks matching queries stale and normally refetches active queries. It does not ensure that missing data is fetched for the next render. The installed `prefetchQuery` API is deprecated and swallows query errors; it cannot enforce a required load. The installed `ensureQueryData` API is also deprecated. For required loader data, return the `queryClient.query`/`ResultAsync.match` adapter in [loader context](loader-context.md).

## Don'ts

### Do not nest an already complete key

```ts
void queryClient.invalidateQueries({
  queryKey: [trpc.products.getMessage.queryKey()],
});
```

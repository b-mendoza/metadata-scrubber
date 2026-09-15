# Read component data through Suspense boundaries

Scope: client data reads in application components.

Why: a data read needs a real loading state, error state, and retry path.

## Do's

### Use Suspense reads and review their parent boundaries

Use Suspense Query APIs with the exported client hook:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "#/shared/libs/trpc/client/client.mod";

export const Message = () => {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.products.getMessage.queryOptions());
  return <div>{data.status}</div>;
};
```

Review the actual parent Suspense fallback, error UI, and query/error reset for retry. Parents may live in other files. Review route data needs before choosing loader prefetch; not every component needs a loader. Static lint does not prove loading, error, streaming, or retry behavior.

## Don'ts

### Do not replace the boundaries with runtime useQuery

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#/shared/libs/trpc/client/client.mod";

export const Message = () => {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.products.getMessage.queryOptions());
  return <div>{data?.status}</div>;
};
```

`metadata-scrubber/no-use-query` rejects runtime `useQuery` access from `@tanstack/react-query`.

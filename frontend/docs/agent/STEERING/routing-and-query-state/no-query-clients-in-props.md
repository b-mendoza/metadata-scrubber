# Read clients through hooks

Scope: every application component under `src/`.

Why: passing query clients or tRPC proxies through props creates a second path to the same dependency.

## Do's

### Read each client in the component that needs it

Import `useQueryClient` from `@tanstack/react-query`. Import `useTRPC` from the project module; that module does not export `useQueryClient`.

```tsx
import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "#/shared/libs/trpc/client/client.mod";

export const RefreshButton = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (
    <button
      onClick={() => {
        void queryClient.invalidateQueries({
          queryKey: trpc.products.getMessage.queryKey(),
        });
      }}
      type="button"
    >
      Refresh
    </button>
  );
};
```

The exception is library-required provider composition in `src/shared/libs/trpc/client/client.mod.tsx` and `src/router.tsx`. Those providers must receive the clients. Keep that setup at the composition boundary; see [loader context](loader-context.md).

## Don'ts

### Do not pass clients through application props or custom providers

Do not add a `QueryClient`, tRPC client or proxy, or router context to application component props. A new application provider does not create another exception.

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

export interface RefreshButtonProps {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}
```

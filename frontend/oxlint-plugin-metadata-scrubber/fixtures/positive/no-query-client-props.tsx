import {
  QueryClient,
  QueryClientProvider as CacheProvider,
} from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

// @ts-expect-error TS2307: The fixture keeps the application import source without compiling the application.
import { trpcContext as rpc } from "#/shared/libs/trpc/client/client-runtime.mod";
// @ts-expect-error TS2307: The fixture checks the application provider wrapper by its import binding.
import { TRPCProvider as AppProvider } from "#/shared/libs/trpc/client/client.mod";

const Child = (_props: Record<string, unknown>) => <div />;
const cache = new QueryClient();

export function Providers({ children }: PropsWithChildren) {
  return (
    <CacheProvider client={cache}>
      <AppProvider queryClient={cache} trpcClient={{}}>
        <rpc.TRPCProvider queryClient={cache} trpcClient={{}}>
          {children}
        </rpc.TRPCProvider>
      </AppProvider>
    </CacheProvider>
  );
}

export function ShadowedHook(useQueryClient: () => string) {
  const cache = useQueryClient();
  return <Child value={cache} />;
}

export function ShadowedContext(rpc: { useTRPC(): string }) {
  return <Child value={rpc.useTRPC()} />;
}

export function UnrelatedRoute(Route: {
  useRouteContext(): { trpc: string; queryClient: string };
}) {
  const { trpc, queryClient } = Route.useRouteContext();
  return <Child first={trpc} second={queryClient} />;
}

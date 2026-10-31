import { useQueryClient as readCache } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext as rootWithContext } from "@tanstack/react-router";

// @ts-expect-error TS2307: The fixture keeps the application import source without compiling the application.
import { trpcContext as rpc } from "#/shared/libs/trpc/client/client-runtime.mod";

const Child = (_props: Record<string, unknown>) => <div />;
export const Route = rootWithContext<{
  queryClient: QueryClient;
  trpc: object;
}>()({});

export function RouteView() {
  const { trpc: routeRpc, queryClient: routeCache } = Route.useRouteContext();
  return <Child trpc={routeRpc} queryClient={routeCache} />;
}

export function ComponentView() {
  const cache = readCache();
  const client = rpc.useTRPC();
  const alias = cache;
  return (
    <Child
      client={client}
      alias={alias}
      direct={readCache()}
      rpc={rpc.useTRPC()}
    />
  );
}

export function NamedProps() {
  return <Child trpc="wrong" queryClient={null} />;
}

export function FalseProvider() {
  const QueryClientProvider = Child;
  const trpcContext = { TRPCProvider: Child };
  const cache = readCache();
  return (
    <>
      <QueryClientProvider client={cache} />
      <trpcContext.TRPCProvider queryClient={cache} />
    </>
  );
}

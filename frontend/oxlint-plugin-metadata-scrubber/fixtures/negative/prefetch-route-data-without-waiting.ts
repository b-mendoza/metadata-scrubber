import { QueryClient, queryOptions } from "@tanstack/react-query";
import {
  createFileRoute as fileRoute,
  createRootRoute as rootRoute,
  createRootRouteWithContext as rootWithContext,
} from "@tanstack/react-router";

const options = queryOptions({ queryKey: ["fixture"], queryFn: () => "ready" });
const infiniteOptions = { queryKey: ["pages"], initialPageParam: 0 };

export const Root = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context }) {
    const { queryClient: cache } = context;
    await cache.query(options);
    await context.queryClient.fetchQuery(options);
    await cache.ensureQueryData(options).catch(() => null);
    return cache.prefetchQuery(options);
  },
});

export const File = fileRoute("/prefetch-negative")({
  async loader({ context: { queryClient: cache } }) {
    await cache.fetchInfiniteQuery(infiniteOptions);
    await cache.ensureInfiniteQueryData(infiniteOptions);
    await cache.prefetchInfiniteQuery(infiniteOptions);
    void cache.query(options);
  },
});

export const Returned = rootRoute({
  beforeLoad: () => ({ queryClient: new QueryClient() }),
  loader: ({ context }) => context.queryClient.query(options),
});

export const Destructured = rootWithContext<{ queryClient: QueryClient }>()({
  loader(input) {
    const { context: routeContext } = input;
    const { queryClient: localCache } = routeContext;
    void localCache.query(options);
  },
});

export const Chained = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context }) {
    const { queryClient } = context;
    void queryClient.query(options).catch();
    void queryClient.query(options).catch(undefined);
    return await queryClient["fetchQuery"](options);
  },
});

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/prefetch-negative": {
      id: "/prefetch-negative";
      path: "/prefetch-negative";
      fullPath: "/prefetch-negative";
      parentRoute: typeof Root;
      preLoaderRoute: typeof Root;
    };
  }
}

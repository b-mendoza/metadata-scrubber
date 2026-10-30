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

const laterOptions = (required: string) =>
  queryOptions({ queryKey: ["later", required], queryFn: () => required });

export const UnusedResult = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    const unused = await cache.ensureQueryData(options);
    return unused;
  },
});

export const WaitedDependency = rootWithContext<{ queryClient: QueryClient }>()(
  {
    async loader({ context: { queryClient: cache } }) {
      const required = await cache.ensureQueryData(options);
      await cache.query(laterOptions(required));
    },
  },
);

export const OutsideQuery = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    const required = await cache.ensureQueryData(options);
    return laterOptions(required);
  },
});

export const UncaughtDependency = rootWithContext<{
  queryClient: QueryClient;
}>()({
  async loader({ context: { queryClient: cache } }) {
    const required = await cache.ensureQueryData(options);
    void cache.query(laterOptions(required));
  },
});

export const ShadowedResult = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    const required = await cache.ensureQueryData(options);
    {
      const required = "unrelated";
      void cache.query(laterOptions(required)).catch(() => null);
    }
    return required;
  },
});

export const NonConstResults = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    let mutable = await cache.ensureQueryData(options);
    void cache.query(laterOptions(mutable)).catch(() => null);
    const { length } = await cache.ensureQueryData(options);
    void cache.query(laterOptions(String(length))).catch(() => null);
  },
});

export const OtherQueryClient = rootWithContext<{ queryClient: QueryClient }>()(
  {
    async loader({ context: { queryClient: cache } }) {
      const required = await cache.ensureQueryData(options);
      const otherClient = new QueryClient();
      void otherClient.query(laterOptions(required)).catch(() => null);
    },
  },
);

export const NestedQuery = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    const required = await cache.ensureQueryData(options);
    const nested = () => {
      void cache.query(laterOptions(required)).catch(() => null);
    };
    nested();
  },
});

export const EarlierQuery = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    void cache
      .query(queryOptions({ queryKey: ["earlier"], queryFn: () => required }))
      .catch(() => null);
    const required = await cache.ensureQueryData(options);
  },
});

export const WrappedAwait = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context: { queryClient: cache } }) {
    const required = String(await cache.ensureQueryData(options));
    void cache.query(laterOptions(required)).catch(() => null);
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

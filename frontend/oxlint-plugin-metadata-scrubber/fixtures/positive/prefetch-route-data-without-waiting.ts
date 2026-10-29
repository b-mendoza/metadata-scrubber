import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext as rootWithContext } from "@tanstack/react-router";

const options = queryOptions({ queryKey: ["fixture"], queryFn: () => "ready" });

export const Route = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context }) {
    const { queryClient: cache } = context;
    void cache.query(options).catch(() => null);
    void context.queryClient.prefetchQuery(options).catch(() => null);
    await Promise.resolve("unrelated");
    const nested = async (cache: QueryClient) => {
      await cache.query(options);
    };
    await nested(cache);
    return "shell";
  },
  async beforeLoad({ context }) {
    return context.queryClient.query(options);
  },
});

export const ShadowedClient = rootWithContext<{ queryClient: QueryClient }>()({
  async loader({ context }) {
    const queryClient = { query: () => Promise.resolve("unrelated") };
    await queryClient.query();
    return context;
  },
});

export function localFactory(
  rootWithContext: () => (config: {
    loader(input: { context: { queryClient: QueryClient } }): Promise<string>;
  }) => unknown,
) {
  return rootWithContext()({
    loader: async ({ context }) => context.queryClient.query(options),
  });
}

export function notARoute(queryClient: QueryClient) {
  return {
    async loader() {
      return queryClient.query(options);
    },
  };
}

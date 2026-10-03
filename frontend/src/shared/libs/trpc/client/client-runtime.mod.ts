import { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import { parse, stringify } from "devalue";

import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

export const trpcContext = createTRPCContext<AppRouter>();

const ONE_MINUTE_STALE_TIME = 60_000;

const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ONE_MINUTE_STALE_TIME,
      },
      dehydrate: {
        serializeData: stringify,
      },
      hydrate: {
        deserializeData: parse,
      },
    },
  });
};

const browserQueryClient: { current: QueryClient | null } = { current: null };

// The server creates one QueryClient for each request.
// The browser reuses one QueryClient so an initial render that suspends
// does not create a new client.
const initializeQueryClient = createIsomorphicFn()
  .server(() => createQueryClient())
  .client(() => {
    browserQueryClient.current ??= createQueryClient();

    return browserQueryClient.current;
  });

const TRPC_PATH = "/api/trpc";

export const getBaseTRPCURL = createIsomorphicFn()
  .server(() => {
    const request = getRequest();

    const requestURL = new URL(request.url);

    return new URL(TRPC_PATH, requestURL.origin);
  })
  .client(() => new URL(TRPC_PATH, location.origin));

export const initializeTRPCClient = (trpcURL: URL) => {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        transformer: {
          deserialize: parse,
          serialize: stringify,
        },
        url: trpcURL,
      }),
    ],
  });
};

const initializeTRPCOptionsProxy = createIsomorphicFn()
  .client((queryClient: QueryClient, trpcClient: TRPCClient<AppRouter>) => {
    return createTRPCOptionsProxy({
      client: trpcClient,
      queryClient,
    });
  })
  .server((queryClient) => {
    const request = getRequest();

    return createTRPCOptionsProxy({
      ctx: () => createTRPCRequestContext(request),
      queryClient,
      router: appRouter,
    });
  });

export function getRouterContext(trpcClient: TRPCClient<AppRouter>) {
  const queryClient = initializeQueryClient();

  const trpcProxy = initializeTRPCOptionsProxy(queryClient, trpcClient);

  return {
    queryClient,
    trpc: trpcProxy,
  };
}

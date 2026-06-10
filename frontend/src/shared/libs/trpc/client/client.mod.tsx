import { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import { parse, stringify } from "devalue";

import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

const t = createTRPCContext<AppRouter>();

// With SSR, we usually want to set some default staleTime
// above 0 to avoid refetching immediately on the client
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

let browserQueryClient: QueryClient | undefined = undefined;

const initializeQueryClient = createIsomorphicFn()
  .server(
    // Server: always make a new query client
    () => createQueryClient(),
  )
  .client(
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    () => {
      browserQueryClient ??= createQueryClient();

      return browserQueryClient;
    },
  );

const TRPC_PATH = "/api/trpc";

export const getBaseTRPCURL = createIsomorphicFn()
  .server(() => {
    const request = getRequest();

    const requestURL = new URL(request.url);

    return new URL(TRPC_PATH, requestURL.origin);
  })
  .client(() => new URL(TRPC_PATH, globalThis.window.location.origin));

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

interface TRPCProviderProps extends React.PropsWithChildren {
  queryClient: QueryClient;
  trpcClient: TRPCClient<AppRouter>;
}

export const TRPCProvider = (props: TRPCProviderProps) => {
  const { queryClient, trpcClient, children } = props;

  return (
    <t.TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </t.TRPCProvider>
  );
};

export function getRouterContext(trpcClient: TRPCClient<AppRouter>) {
  const queryClient = initializeQueryClient();

  const trpcProxy = initializeTRPCOptionsProxy(queryClient, trpcClient);

  return {
    queryClient,
    trpc: trpcProxy,
  };
}

export interface RouterInputs extends inferRouterInputs<AppRouter> {}

export interface RouterOutputs extends inferRouterOutputs<AppRouter> {}

// type TRPCClientTypes = inferTRPCClientTypes<AppRouter>;

// export type TRPCClientError = TRPCClientErrorLike<TRPCClientTypes>;

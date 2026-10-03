import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface TRPCProviderProps extends React.PropsWithChildren {
  queryClient: QueryClient;
  trpcClient: TRPCClient<AppRouter>;
}

export const TRPCProvider = (props: TRPCProviderProps) => {
  const { queryClient, trpcClient, children } = props;

  return (
    <trpcContext.TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </trpcContext.TRPCProvider>
  );
};

export type RouterInputs = inferRouterInputs<AppRouter>;

export type RouterOutputs = inferRouterOutputs<AppRouter>;

// type TRPCClientTypes = inferTRPCClientTypes<AppRouter>;

// export type TRPCClientError = TRPCClientErrorLike<TRPCClientTypes>;

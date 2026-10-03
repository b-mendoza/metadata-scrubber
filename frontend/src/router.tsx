import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { TRPCProvider } from "#/shared/libs/trpc/client/client.mod";
import {
  getBaseTRPCURL,
  getRouterContext,
  initializeTRPCClient,
} from "#/shared/libs/trpc/client/client-runtime.mod";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const trpcURL = getBaseTRPCURL();

  const trpcClient = initializeTRPCClient(trpcURL);

  const routerContext = getRouterContext(trpcClient);

  const router = createRouter({
    context: {
      ...routerContext,
    },
    defaultPreload: "viewport",
    routeTree,
    scrollRestoration: true,
    Wrap: (props: React.PropsWithChildren) => (
      <TRPCProvider
        queryClient={routerContext.queryClient}
        trpcClient={trpcClient}
      >
        {props.children}
      </TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    queryClient: routerContext.queryClient,
    router,
  });

  return router;
};

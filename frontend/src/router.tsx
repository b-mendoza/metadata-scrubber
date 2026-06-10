import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { ToastNotificationsManager } from "#/domains/notifications/components/toast-notifications-manager/toast-notifications-manager.mod";
import {
  getBaseTRPCURL,
  getRouterContext,
  initializeTRPCClient,
  TRPCProvider,
} from "#/shared/libs/trpc/client/client.mod";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
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
        <ToastNotificationsManager />

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

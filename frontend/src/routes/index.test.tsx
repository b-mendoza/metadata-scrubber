import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { expect, test } from "vitest";

import type { MessageResponse } from "#/domains/products/products-router.mod.server";
import { TRPCProvider } from "#/shared/libs/trpc/client/client.mod";
import { initializeTRPCClient } from "#/shared/libs/trpc/client/client-runtime.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { Route } from "./index";

function renderHome(healthResponse: MessageResponse) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  const trpcClient = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  queryClient.setQueryData(
    trpc.products.getMessage.queryOptions().queryKey,
    healthResponse,
  );

  const IndexRoute = Route.options.component;
  expect.assert(IndexRoute != null);

  return renderComponent(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <IndexRoute />
      </TRPCProvider>
    </QueryClientProvider>,
  );
}

test("Message shows the cached health status without route context", () => {
  const healthResponse: MessageResponse = {
    status: "reachable",
  };

  renderHome(healthResponse);

  expect(screen.getByRole("heading", { name: "Hello, world!" })).toBeVisible();
  expect(
    screen.getByText(healthResponse.status, { exact: true }),
  ).toBeVisible();
});

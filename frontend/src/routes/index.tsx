import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { CACHE_CONTROL_HEADER } from "#/shared/constants/http/headers/headers.mod";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  headers() {
    return {
      [CACHE_CONTROL_HEADER]: "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    };
  },
  loader({ context }) {
    const { queryClient, trpc } = context;

    queryClient
      .prefetchQuery(trpc.products.getProducts.queryOptions())
      .catch(() => null);
  },
  head() {
    return {
      meta: [
        {
          title: "Home",
        },
      ],
    };
  },
});

function IndexRoute() {
  return (
    <>
      <h1>Hello, world!</h1>

      <Suspense fallback={<div>Loading...</div>}>
        <ProductList />
      </Suspense>
    </>
  );
}

const ProductList = () => {
  const { trpc } = Route.useRouteContext();

  const { data: products } = useSuspenseQuery(
    trpc.products.getProducts.queryOptions(),
  );

  return (
    <>
      <h1>Products</h1>

      <hr />

      <ul>
        {products.map((product) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </>
  );
};

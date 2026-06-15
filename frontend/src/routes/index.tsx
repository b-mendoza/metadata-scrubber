import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import {
  CACHE_CONTROL_HEADER,
  X_ACCEL_BUFFERING_HEADER,
} from "#/shared/constants/http/headers/headers.mod";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  headers() {
    // Railway may gzip/buffer streamed HTML unless transforms and proxy
    // buffering are disabled, which prevents React from flushing Suspense
    // fallbacks before slow queries resolve.
    return {
      [CACHE_CONTROL_HEADER]: "no-cache, no-transform",
      [X_ACCEL_BUFFERING_HEADER]: "no",
    };
  },
  loader({ context }) {
    const { queryClient, trpc } = context;

    queryClient
      .prefetchQuery(trpc.products.getProducts.queryOptions())
      .catch(() => null);

    queryClient
      .prefetchQuery(trpc.products.getMessage.queryOptions())
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
        <Message />
      </Suspense>

      <Suspense fallback={<div>Loading...</div>}>
        <ProductList />
      </Suspense>
    </>
  );
}

const ProductList = () => {
  const { trpc } = Route.useRouteContext();

  const getProductsQueryResult = useSuspenseQuery(
    trpc.products.getProducts.queryOptions(),
  );

  const products = getProductsQueryResult.data;

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

const Message = () => {
  const { trpc } = Route.useRouteContext();

  const getMessageQueryResult = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  const message = getMessageQueryResult.data.status;

  return <div>{message}</div>;
};

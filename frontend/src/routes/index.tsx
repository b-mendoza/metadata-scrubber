import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  head() {
    return {
      meta: [
        {
          title: "Home",
        },
      ],
    };
  },
  loader({ context }) {
    const { queryClient, trpc } = context;

    queryClient
      .prefetchQuery(trpc.products.getProducts.queryOptions())
      .catch(() => null);

    return null;
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

  const getProductsQuery = useSuspenseQuery(
    trpc.products.getProducts.queryOptions(),
  );

  const products = getProductsQuery.data;

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

import { createFileRoute } from "@tanstack/react-router";

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
  return <div>Hello, world!</div>;
}

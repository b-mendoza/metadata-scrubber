import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader({ context }) {
    const { queryClient, trpc } = context;

    void queryClient
      .query(trpc.products.getMessage.queryOptions())
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
    </>
  );
}

const Message = () => {
  const { trpc } = Route.useRouteContext();

  const messageQuery = useSuspenseQuery(
    trpc.products.getMessage.queryOptions(),
  );

  const message = messageQuery.data.status;

  return <div>{message}</div>;
};

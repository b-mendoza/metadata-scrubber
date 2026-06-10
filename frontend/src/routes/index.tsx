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
});

function IndexRoute() {
  return <div>Hello, world!</div>;
}

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/wizard")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}

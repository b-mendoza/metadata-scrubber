import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: handleHealth,
    },
  },
});

export function handleHealth() {
  return Response.json({ status: "ok" });
}

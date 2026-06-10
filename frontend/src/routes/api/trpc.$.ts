import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      async GET(ctx) {
        return trpcRequestHandler(ctx.request);
      },
      async POST(ctx) {
        return trpcRequestHandler(ctx.request);
      },
    },
  },
});

async function trpcRequestHandler(request: Request) {
  return fetchRequestHandler({
    createContext: () => createTRPCRequestContext(request),
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
  });
}

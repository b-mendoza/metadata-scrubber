import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import posthog from "posthog-js";
import { afterEach, expect, test, vi } from "vitest";

import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import { initializeTRPCClient } from "./client-runtime.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

afterEach(() => {
  posthog.__loaded = false;
  vi.unstubAllEnvs();
});

function setupClient() {
  const healthResponse: RouterOutputs["products"]["getMessage"] = {
    status: "reachable",
  };
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({
      hooks: { beforeRequest: [() => Response.json(healthResponse)] },
    }),
    workflowHttpClient: ky.create(),
  });
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => createTRPCRequestContext(request),
      });
    });
  vi.stubGlobal("fetch", fetchMock);
  const client = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  return { client, fetchMock };
}

test("browser tRPC calls send the current PostHog IDs on every request", async () => {
  vi.stubEnv("SSR", false);
  posthog.__loaded = true;
  vi.spyOn(posthog, "get_distinct_id")
    .mockReturnValueOnce("visitor-a")
    .mockReturnValue("visitor-b");
  vi.spyOn(posthog, "get_session_id")
    .mockReturnValueOnce("session-a")
    .mockReturnValue("session-b");
  const { client, fetchMock } = setupClient();

  await client.products.getMessage.query();
  await client.products.getMessage.query();

  const [[, firstOptions] = [], [, secondOptions] = []] = fetchMock.mock.calls;
  const firstHeaders = new Headers(firstOptions?.headers);
  const secondHeaders = new Headers(secondOptions?.headers);
  expect(firstHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-a");
  expect(firstHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-a");
  expect(secondHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-b");
  expect(secondHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-b");
});

test.each([
  ["an uninitialized browser", false, false],
  ["SSR with an initialized SDK", true, true],
])("tRPC sends no PostHog IDs for %s", async (_name, ssr, initialized) => {
  vi.stubEnv("SSR", ssr);
  posthog.__loaded = initialized;
  const { client, fetchMock } = setupClient();

  await client.products.getMessage.query();

  const [[, options] = []] = fetchMock.mock.calls;
  const headers = new Headers(options?.headers);
  expect(headers.has("X-POSTHOG-DISTINCT-ID")).toBe(false);
  expect(headers.has("X-POSTHOG-SESSION-ID")).toBe(false);
});

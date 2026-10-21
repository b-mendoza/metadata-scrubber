import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { KyInstance } from "ky";
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
});

function setupClient(workflowHttpClient: KyInstance) {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create(),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient,
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
  posthog.__loaded = true;
  vi.spyOn(posthog, "get_distinct_id")
    .mockReturnValueOnce("visitor-a")
    .mockReturnValue("visitor-b");
  vi.spyOn(posthog, "get_session_id")
    .mockReturnValueOnce("session-a")
    .mockReturnValue("session-b");
  const response: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 7_340_032,
  };
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: { beforeRequest: [() => Response.json(response)] },
    }),
  );

  await client.wizard.getWorkflowConfig.query();
  await client.wizard.getWorkflowConfig.query();

  const [[, firstOptions] = [], [, secondOptions] = []] = fetchMock.mock.calls;
  const firstHeaders = new Headers(firstOptions?.headers);
  const secondHeaders = new Headers(secondOptions?.headers);
  expect(firstHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-a");
  expect(firstHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-a");
  expect(secondHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-b");
  expect(secondHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-b");
});

test("tRPC sends no PostHog IDs for an uninitialized browser", async () => {
  posthog.__loaded = false;
  const response: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 7_340_032,
  };
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: { beforeRequest: [() => Response.json(response)] },
    }),
  );

  await client.wizard.getWorkflowConfig.query();

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[, options] = []] = fetchMock.mock.calls;
  expect(options?.method).toBe("GET");
  expect(options?.body).toBeUndefined();
  const headers = new Headers(options?.headers);
  expect(headers.has("X-POSTHOG-DISTINCT-ID")).toBe(false);
  expect(headers.has("X-POSTHOG-SESSION-ID")).toBe(false);
});

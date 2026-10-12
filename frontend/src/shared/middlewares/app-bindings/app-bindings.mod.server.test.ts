import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { appBindingsMiddleware, getAppBindings } from "./app-bindings.mod";

beforeEach(() => {
  vi.stubEnv("BACKEND_URL", "https://backend.test/");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  {
    name: "both IDs",
    headers: {
      "X-POSTHOG-DISTINCT-ID": "visitor-a",
      "X-POSTHOG-SESSION-ID": "session-a",
    },
    distinctId: "visitor-a",
    sessionId: "session-a",
  },
  {
    name: "only the distinct ID",
    headers: { "X-POSTHOG-DISTINCT-ID": "visitor-a" },
    distinctId: "visitor-a",
    sessionId: null,
  },
  {
    name: "only the session ID",
    headers: { "X-POSTHOG-SESSION-ID": "session-a" },
    distinctId: null,
    sessionId: "session-a",
  },
  {
    name: "empty IDs",
    headers: { "X-POSTHOG-DISTINCT-ID": "", "X-POSTHOG-SESSION-ID": "" },
    distinctId: "",
    sessionId: "",
  },
  { name: "no IDs", headers: {}, distinctId: null, sessionId: null },
])(
  "workflow calls forward $name without other incoming headers",
  async ({ headers, distinctId, sessionId }) => {
    const request = new Request("https://frontend.test/api/trpc", {
      headers: {
        ...headers,
        Authorization: "Bearer private",
        Cookie: "private=value",
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const handler = appBindingsMiddleware.options.server;
    expect.assert(handler != null);
    const completed = new Error("The outbound request is complete");

    await expect(
      handler({
        request,
        pathname: "/api/trpc",
        // eslint-disable-next-line no-undefined -- TanStack requires undefined for a request middleware without context.
        context: undefined,
        handlerType: "router",
        next: async (): Promise<never> => {
          const { workflowHttpClient } = getAppBindings();
          await workflowHttpClient.get("/api/config");
          // Stop after the outbound request instead of creating a router context.
          throw completed;
        },
      }),
    ).rejects.toBe(completed);

    const [[outgoing] = []] = fetchMock.mock.calls;
    expect.assert(outgoing instanceof Request);
    expect(outgoing.headers.get("X-POSTHOG-DISTINCT-ID")).toBe(distinctId);
    expect(outgoing.headers.get("X-POSTHOG-SESSION-ID")).toBe(sessionId);
    expect(outgoing.headers.has("Authorization")).toBe(false);
    expect(outgoing.headers.has("Cookie")).toBe(false);
  },
);

test("health calls never forward incoming PostHog IDs", async () => {
  const request = new Request("https://frontend.test/api/trpc", {
    headers: {
      "X-POSTHOG-DISTINCT-ID": "visitor-a",
      "X-POSTHOG-SESSION-ID": "session-a",
    },
  });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
  vi.stubGlobal("fetch", fetchMock);
  const handler = appBindingsMiddleware.options.server;
  expect.assert(handler != null);
  const completed = new Error("The outbound request is complete");

  await expect(
    handler({
      request,
      pathname: "/api/trpc",
      // eslint-disable-next-line no-undefined -- TanStack requires undefined for a request middleware without context.
      context: undefined,
      handlerType: "router",
      next: async (): Promise<never> => {
        const { httpClient } = getAppBindings();
        await httpClient.get("/api/health");
        // Stop after the outbound request instead of creating a router context.
        throw completed;
      },
    }),
  ).rejects.toBe(completed);

  const [[outgoing] = []] = fetchMock.mock.calls;
  expect.assert(outgoing instanceof Request);
  expect(outgoing.headers.has("X-POSTHOG-DISTINCT-ID")).toBe(false);
  expect(outgoing.headers.has("X-POSTHOG-SESSION-ID")).toBe(false);
});

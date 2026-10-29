import type { HttpResponseResolver } from "msw";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

import {
  appBindingsMiddleware,
  getAppBindings,
} from "#/shared/middlewares/app-bindings/app-bindings.mod";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.stubEnv("BACKEND_URL", "https://backend.test/");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_public_token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  server.resetHandlers();
});

test.each([
  // eslint-disable-next-line no-undefined -- Vitest uses undefined to remove the environment variable.
  { name: "an absent token", token: undefined },
  { name: "a personal API key", token: "phx_secret_personal_key" },
])(
  "requests fail before downstream code runs with $name",
  async ({ token }) => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", token);
    const handler = appBindingsMiddleware.options.server;
    expect.assert(handler != null);
    const next = vi.fn<() => Promise<never>>();

    await expect(
      handler({
        request: new Request("https://frontend.test/"),
        pathname: "/",
        // eslint-disable-next-line no-undefined -- TanStack requires undefined for a request middleware without context.
        context: undefined,
        handlerType: "router",
        next,
      }),
    ).rejects.toThrow(
      "The POSTHOG_PROJECT_TOKEN value must be a PostHog project token that starts with phc_.",
    );
    expect(next).not.toHaveBeenCalled();
  },
);

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
    const handlerResponse = vi.fn<HttpResponseResolver>(
      () => new HttpResponse(null),
    );
    server.use(http.get("https://backend.test/api/config", handlerResponse));
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

    const [[handlerInfo] = []] = handlerResponse.mock.calls;
    expect.assert(handlerInfo?.request instanceof Request);
    expect(handlerInfo.request.headers.get("X-POSTHOG-DISTINCT-ID")).toBe(
      distinctId,
    );
    expect(handlerInfo.request.headers.get("X-POSTHOG-SESSION-ID")).toBe(
      sessionId,
    );
    expect(handlerInfo.request.headers.has("Authorization")).toBe(false);
    expect(handlerInfo.request.headers.has("Cookie")).toBe(false);
  },
);

test("health calls never forward incoming PostHog IDs", async () => {
  const request = new Request("https://frontend.test/api/trpc", {
    headers: {
      "X-POSTHOG-DISTINCT-ID": "visitor-a",
      "X-POSTHOG-SESSION-ID": "session-a",
    },
  });
  const handlerResponse = vi.fn<HttpResponseResolver>(
    () => new HttpResponse(null),
  );
  server.use(http.get("https://backend.test/api/health", handlerResponse));
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

  const [[handlerInfo] = []] = handlerResponse.mock.calls;
  expect.assert(handlerInfo?.request instanceof Request);
  expect(handlerInfo.request.headers.has("X-POSTHOG-DISTINCT-ID")).toBe(false);
  expect(handlerInfo.request.headers.has("X-POSTHOG-SESSION-ID")).toBe(false);
});

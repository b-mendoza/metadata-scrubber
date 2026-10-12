import { afterEach, expect, test, vi } from "vitest";

import { appBindingsMiddleware } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import { getPostHogBrowserConfig } from "./posthog-browser-config.mod.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("the browser configuration uses the validated project token and fixed options", async () => {
  vi.stubEnv("BACKEND_URL", "https://backend.test/");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_public_token");
  const handler = appBindingsMiddleware.options.server;
  expect.assert(handler != null);
  const loaded: Array<ReturnType<typeof getPostHogBrowserConfig>> = [];
  const completed = new Error("The configuration is loaded");

  await expect(
    handler({
      request: new Request("https://frontend.test/"),
      pathname: "/",
      // eslint-disable-next-line no-undefined -- TanStack requires undefined for a request middleware without context.
      context: undefined,
      handlerType: "router",
      next: vi.fn<() => Promise<never>>(() => {
        loaded.push(getPostHogBrowserConfig());
        // Stop after the read instead of creating a router context.
        throw completed;
      }),
    }),
  ).rejects.toBe(completed);

  expect(loaded).toStrictEqual([
    {
      apiKey: "phc_test_public_token",
      options: {
        defaults: "2026-08-30",
        api_host: "/relay",
        ui_host: "https://us.posthog.com",
        capture_exceptions: true,
        capture_performance: { web_vitals: true },
        disable_session_recording: true,
        person_profiles: "identified_only",
      },
    },
  ]);
});

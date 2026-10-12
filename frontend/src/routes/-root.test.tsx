import { screen } from "@testing-library/react";
import posthog from "posthog-js";
import { memo } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { getPostHogBrowserConfig } from "#/shared/config/posthog/posthog-browser-config.mod.server";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { RootComponent, Route } from "./__root";

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    Outlet: memo(() => <h1>Metadata Scrubber</h1>),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setupRoot() {
  const config: ReturnType<typeof getPostHogBrowserConfig> = {
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
  };
  vi.spyOn(Route, "useLoaderData").mockReturnValue(config);
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);
  return { config, init };
}

test("a production build starts browser analytics with the loaded configuration", () => {
  vi.stubEnv("DEV", false);
  const { config, init } = setupRoot();

  renderComponent(<RootComponent />);

  expect(
    screen.getByRole("heading", { name: "Metadata Scrubber" }),
  ).toBeVisible();
  expect(init).toHaveBeenCalledExactlyOnceWith(config.apiKey, config.options);
});

test("a development build renders the root without starting analytics", () => {
  vi.stubEnv("DEV", true);
  const { init } = setupRoot();

  renderComponent(<RootComponent />);

  expect(
    screen.getByRole("heading", { name: "Metadata Scrubber" }),
  ).toBeVisible();
  expect(init).not.toHaveBeenCalled();
});

import { screen } from "@testing-library/react";
import posthog from "posthog-js";
import { memo } from "react";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";

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

test("the root starts browser analytics with the loaded configuration", () => {
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

  renderComponent(<RootComponent />);

  expect(
    screen.getByRole("heading", { name: "Metadata Scrubber" }),
  ).toBeVisible();
  expect(init).toHaveBeenCalledExactlyOnceWith(config.apiKey, config.options);
});

test("SSR renders the root without initializing analytics", () => {
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

  const view = renderToString(<RootComponent />);

  expect(view).toContain("Metadata Scrubber");
  expect(init).not.toHaveBeenCalled();
});

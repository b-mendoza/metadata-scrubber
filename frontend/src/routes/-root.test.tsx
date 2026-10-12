import { screen } from "@testing-library/react";
import posthog from "posthog-js";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { DocumentShell } from "./__root";

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    HeadContent: () => <meta name="test" />,
    Scripts: () => <script />,
  };
});

beforeEach(() => {
  vi.stubEnv("DEV", false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("the root renders without analytics when the public token is absent", () => {
  // eslint-disable-next-line no-undefined, unicorn/no-useless-undefined -- Vitest requires this argument and uses undefined to remove the environment variable.
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", undefined);
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);

  renderComponent(
    <DocumentShell>
      <h1>Metadata Scrubber</h1>
    </DocumentShell>,
  );

  expect(
    screen.getByRole("heading", { name: "Metadata Scrubber" }),
  ).toBeVisible();
  expect(init).not.toHaveBeenCalled();
});

test("the root starts browser analytics with the required options", () => {
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_test_public_token");
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);

  renderComponent(
    <DocumentShell>
      <h1>Metadata Scrubber</h1>
    </DocumentShell>,
  );

  expect(
    screen.getByRole("heading", { name: "Metadata Scrubber" }),
  ).toBeVisible();
  expect(init).toHaveBeenCalledExactlyOnceWith("phc_test_public_token", {
    defaults: "2026-08-30",
    api_host: "/relay",
    ui_host: "https://us.posthog.com",
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
});

test("SSR renders the root without initializing analytics even with a token", () => {
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_test_public_token");
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);

  const view = renderToString(
    <DocumentShell>
      <h1>Metadata Scrubber</h1>
    </DocumentShell>,
  );

  expect(view).toContain("Metadata Scrubber");
  expect(init).not.toHaveBeenCalled();
});

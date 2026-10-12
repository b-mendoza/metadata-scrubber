import type { PostHogConfig } from "posthog-js";

import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export const getPostHogBrowserConfig = () => {
  const { posthogProjectToken } = getAppBindings();

  return {
    apiKey: posthogProjectToken,
    options: {
      defaults: "2026-08-30",
      api_host: "/relay",
      // eslint-disable-next-line metadata-scrubber/no-hardcoded-backend-host -- This fixed US Cloud UI host is not the backend or the event transport.
      ui_host: "https://us.posthog.com",
      capture_exceptions: true,
      capture_performance: { web_vitals: true },
      disable_session_recording: true,
      person_profiles: "identified_only",
    } satisfies Partial<PostHogConfig>,
  };
};

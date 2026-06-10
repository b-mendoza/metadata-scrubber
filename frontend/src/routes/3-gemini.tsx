import { createFileRoute } from "@tanstack/react-router";

import { GeminiLandingPage } from "#/features/gemini-landing/3-gemini/3-gemini-page";

export const Route = createFileRoute("/3-gemini")({
  component: GeminiLandingPage,
  head() {
    return {
      meta: [
        {
          title: "SPENDGUARD_SYS | V.3.0",
        },
      ],
    };
  },
});

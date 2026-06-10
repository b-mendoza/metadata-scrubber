import { createFileRoute } from "@tanstack/react-router";

import { GeminiTwoPage } from "#/features/gemini-landing/2-gemini/2-gemini-page";

export const Route = createFileRoute("/2-gemini")({
  component: GeminiTwoPage,
  head() {
    return {
      meta: [
        {
          title: "SpendGuard | Precision Finance",
        },
      ],
    };
  },
});

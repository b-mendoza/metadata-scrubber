import { createFileRoute } from "@tanstack/react-router";

import { GeminiOnePage } from "#/features/gemini-landing/1-gemini/1-gemini-page";

export const Route = createFileRoute("/1-gemini")({
  component: GeminiOnePage,
  head() {
    return {
      meta: [
        {
          title: "Spend Guard | Intelligent Spend Management",
        },
        {
          name: "description",
          content:
            "El Salvador-first spend and invoice intelligence app. Automate DTE, 3-way matching, and photo OCR.",
        },
      ],
    };
  },
});

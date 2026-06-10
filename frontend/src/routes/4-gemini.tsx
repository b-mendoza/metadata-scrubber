import { createFileRoute } from "@tanstack/react-router";

import { GeminiLandingPage } from "#/features/gemini-landing/4-gemini/4-gemini-page";

export const Route = createFileRoute("/4-gemini")({
  component: GeminiLandingPage,
});

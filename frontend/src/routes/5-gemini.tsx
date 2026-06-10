import { createFileRoute } from "@tanstack/react-router";

import { GeminiLandingPage } from "#/features/gemini-landing/5-gemini/5-gemini-page";

export const Route = createFileRoute("/5-gemini")({
  component: GeminiLandingPage,
});

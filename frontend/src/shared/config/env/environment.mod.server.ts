import * as z from "zod";

const HTTP_PROTOCOL = /^https?$/v;

const POSTHOG_PROJECT_TOKEN_ERROR =
  "The POSTHOG_PROJECT_TOKEN value must be a PostHog project token that starts with phc_. Set POSTHOG_PROJECT_TOKEN to the project token from the PostHog project settings.";

export const environmentSchema = z.object({
  // On Vercel this is injected by the service binding to the backend
  // container; locally it comes from docker-compose/pnpm. Accept both http
  // (local) and https (Vercel's internal binding URL).
  BACKEND_URL: z
    .url({
      error:
        "The BACKEND_URL value must be an absolute http or https URL. Set BACKEND_URL to the backend service base URL including its http or https scheme.",
      protocol: HTTP_PROTOCOL,
    })
    .transform((url) => new URL(url)),
  // The browser receives this value. The phc_ prefix marks a public project
  // token and rejects a secret personal API key (phx_).
  POSTHOG_PROJECT_TOKEN: z
    .string({ error: POSTHOG_PROJECT_TOKEN_ERROR })
    .trim()
    .startsWith("phc_", { error: POSTHOG_PROJECT_TOKEN_ERROR }),
});

import * as z from "zod";

const HTTP_PROTOCOL = /^https?$/v;

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
});

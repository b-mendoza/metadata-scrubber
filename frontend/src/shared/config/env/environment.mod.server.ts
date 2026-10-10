import * as z from "zod";

const HTTP_PROTOCOL = /^https?$/v;

export const environmentSchema = z.object({
  // Ky needs an absolute HTTP(S) base URL even when BACKEND routes the request.
  BACKEND_URL: z
    .url({
      error:
        "The BACKEND_URL value must be an absolute http or https URL. Set BACKEND_URL to the backend service base URL including its http or https scheme.",
      protocol: HTTP_PROTOCOL,
    })
    .transform((url) => new URL(url)),
});

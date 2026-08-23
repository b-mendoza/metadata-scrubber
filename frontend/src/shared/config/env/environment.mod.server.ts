import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

const MINIMUM_DATABASE_URL_LENGTH = 1;

export const environmentSchema = z.object({
  // Currently unused (the Drizzle client is commented out and no database
  // service is provisioned). Optional so it doesn't block deploys; make it
  // required again once the database is wired up and DATABASE_URL is set.
  DATABASE_URL: z
    .string({
      error:
        "The DATABASE_URL value must be a string, null, or omitted. Set DATABASE_URL to a non-empty connection URL, set it to null, or remove it.",
    })
    .trim()
    .min(MINIMUM_DATABASE_URL_LENGTH, {
      error:
        "The DATABASE_URL value is empty after whitespace is removed. Set DATABASE_URL to a non-empty connection URL, set it to null, or remove it.",
    })
    .nullish(),
  // On Vercel this is injected by the service binding to the backend
  // container; locally it comes from docker-compose/pnpm. Accept both http
  // (local) and https (Vercel's internal binding URL).
  BACKEND_URL: createURLSchema({
    protocol: /^https?$/,
  }),
});

export type Environment = z.output<typeof environmentSchema>;

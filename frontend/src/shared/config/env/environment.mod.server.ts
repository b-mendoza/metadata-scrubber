import { Schema } from "effect";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

export const environmentSchema = Schema.Struct({
  // Currently unused (the Drizzle client is commented out and no database
  // service is provisioned). Optional so it doesn't block deploys; make it
  // required again once the database is wired up and DATABASE_URL is set.
  DATABASE_URL: Schema.mutableKey(
    Schema.optional(Schema.NullOr(Schema.Trim.check(Schema.isNonEmpty()))),
  ),
  // On Vercel this is injected by the service binding to the backend
  // container; locally it comes from docker-compose/pnpm. Accept both http
  // (local) and https (Vercel's internal binding URL).
  BACKEND_URL: Schema.mutableKey(
    createURLSchema({
      protocol: /^https?$/,
    }),
  ),
});

export type Environment = typeof environmentSchema.Type;

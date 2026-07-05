import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
  // On Vercel this is injected by the service binding to the backend
  // container; locally it comes from docker-compose/pnpm. Accept both http
  // (local) and https (Vercel's internal binding URL).
  BACKEND_URL: createURLSchema(),
});

export interface Env extends z.output<typeof envSchema> {}

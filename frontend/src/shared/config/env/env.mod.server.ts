import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
  BACKEND_URL: createURLSchema({
    protocol: /^http$/,
  }),
});

export interface Env extends z.output<typeof envSchema> {}

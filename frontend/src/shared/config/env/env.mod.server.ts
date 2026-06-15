import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

export const envSchema = z.object({
  BACKEND_URL: createURLSchema({
    protocol: /^http$/,
  }),
  DATABASE_URL: z.string().trim().nonempty(),
});

export interface Env extends z.output<typeof envSchema> {}

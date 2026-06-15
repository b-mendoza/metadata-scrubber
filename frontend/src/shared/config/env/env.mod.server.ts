import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

export const envSchema = z.object({
  BACKEND_URL: createURLSchema({
    protocol: IS_PRODUCTION ? undefined : /^http$/,
  }),
  DATABASE_URL: z.string().trim().nonempty(),
});

export interface Env extends z.output<typeof envSchema> {}

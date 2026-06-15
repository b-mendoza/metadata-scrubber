import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
});

const localEnvSchema = baseEnvSchema.extend({
  BACKEND_URL: createURLSchema({
    protocol: /^http$/,
  }),
  NODE_ENV: z.enum(["development", "test"]),
});

const productionEnvSchema = baseEnvSchema.extend({
  BACKEND_URL: z.string().trim().nonempty(),
  NODE_ENV: z.literal("production"),
});

export const envSchema = z.discriminatedUnion("NODE_ENV", [
  localEnvSchema,
  productionEnvSchema,
]);

export type Env = z.output<typeof envSchema>;

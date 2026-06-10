import * as z from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
});

export interface Env extends z.output<typeof envSchema> {}

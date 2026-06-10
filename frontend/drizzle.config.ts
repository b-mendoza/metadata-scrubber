import { defineConfig } from "drizzle-kit";
import * as z from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
});

const env = z.parse(envSchema, process.env);

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./src/shared/db/migrations",
  schema: "./src/shared/db/db.schema.server.ts",
  strict: true,
  verbose: true,
});

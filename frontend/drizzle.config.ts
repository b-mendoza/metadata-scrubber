import { defineConfig } from "drizzle-kit";
import * as z from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().trim().nonempty(),
});

const environment = z.parse(environmentSchema, process.env);

export default defineConfig({
  dbCredentials: {
    url: environment.DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./src/shared/database/migrations",
  schema: "./src/shared/database/database.schema.server.ts",
  strict: true,
  verbose: true,
});

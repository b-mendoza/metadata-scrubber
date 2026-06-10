import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { relations } from "#/shared/db/db.relations.server";

export const createDrizzleDatabaseClient = (dbUrl: string) => {
  const queryClient = postgres(dbUrl);

  return drizzle({
    client: queryClient,
    jit: true,
    logger: import.meta.env.DEV,
    relations,
  });
};

export interface DrizzleDatabaseClient extends ReturnType<
  typeof createDrizzleDatabaseClient
> {}

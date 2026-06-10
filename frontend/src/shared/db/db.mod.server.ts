import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { relations } from "#/shared/db/db.relations.server";

interface UnknownPostgresTypes extends Record<
  string,
  postgres.PostgresType<unknown>
> {}

export interface DrizzleDatabaseClient extends PostgresJsDatabase<
  typeof relations
> {
  $client: postgres.Sql<UnknownPostgresTypes>;
}

const SQL_CLIENT_PRODUCTION_OPTIONS: postgres.Options<UnknownPostgresTypes> = {
  /**
   * Disables runtime type fetching from `pg_types`. The postgres.js driver
   * queries this system catalog on first connect to map OIDs to type parsers.
   * Since we don't use custom Postgres types, we skip this query to reduce
   * cold-start latency.
   */
  fetch_types: false,
  /**
   * Limits the connection pool to 5 concurrent connections. Cloudflare Workers
   * allow at most 6 simultaneous outbound connections per request, so we stay
   * under that ceiling to avoid hitting platform limits.
   *
   * @see https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
   */
  max: 5,
};

export const createDrizzleDatabaseClient = (
  dbUrl: string,
): DrizzleDatabaseClient => {
  const queryClient = postgres<UnknownPostgresTypes>(
    dbUrl,
    import.meta.env.PROD ? SQL_CLIENT_PRODUCTION_OPTIONS : undefined,
  );

  return drizzle({
    client: queryClient,
    // Cloudflare Workers disallow `new Function`, which Drizzle JIT mappers
    // require. Keep JIT disabled to avoid runtime fallback warnings.
    // jit: true,
    logger: import.meta.env.DEV,
    relations,
  });
};

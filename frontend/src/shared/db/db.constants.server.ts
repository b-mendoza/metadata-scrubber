import type { PgTimestampConfig } from "drizzle-orm/pg-core";
import { timestamp, uuid } from "drizzle-orm/pg-core";

const PG_TIMESTAMP_PRECISION = 3;

export const DEFAULT_TIMESTAMP_CONFIG = {
  mode: "date",
  precision: PG_TIMESTAMP_PRECISION,
} satisfies PgTimestampConfig<"date">;

export const DEFAULT_COLUMNS = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", DEFAULT_TIMESTAMP_CONFIG)
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", DEFAULT_TIMESTAMP_CONFIG)
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

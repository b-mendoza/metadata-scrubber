import { pgTable, text } from "drizzle-orm/pg-core";

import { DEFAULT_COLUMNS } from "./db.constants.server";

// ============================================================================
// Table definitions
// ============================================================================

const usersTable = pgTable("users", {
  ...DEFAULT_COLUMNS,
  email: text("email").unique().notNull(),
});

// ============================================================================
// TypeScript types
// ============================================================================

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

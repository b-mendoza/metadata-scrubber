import { defineRelations } from "drizzle-orm";

import * as schema from "./db.schema.server";

export const relations = defineRelations(schema);

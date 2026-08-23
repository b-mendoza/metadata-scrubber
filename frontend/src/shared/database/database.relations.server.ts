import { defineRelations } from "drizzle-orm";

import * as schema from "./database.schema.server";

export const relations = defineRelations(schema);

import { defineRelations } from "drizzle-orm";

import * as schema from "./db.schema.server";

export const relations = defineRelations(schema, (r) => ({
  // Session → Documents (one-to-many)
  analysisSessionsTable: {
    /** A session has many documents */
    documents: r.many.uploadedDocumentsTable(),
  },

  // Document → Session (many-to-one)
  uploadedDocumentsTable: {
    /** A document belongs to a session */
    session: r.one.analysisSessionsTable({
      from: r.uploadedDocumentsTable.sessionId,
      to: r.analysisSessionsTable.id,
    }),
  },

  // Analysis → Document (one-to-one)
  documentAnalysesTable: {
    /** An analysis belongs to a document */
    document: r.one.uploadedDocumentsTable({
      from: r.documentAnalysesTable.documentId,
      to: r.uploadedDocumentsTable.id,
    }),
  },
}));

import {
  bigint,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  DEFAULT_COLUMNS,
  DEFAULT_TIMESTAMP_CONFIG,
} from "./db.constants.server";

// ============================================================================
// Enum Definitions
// ============================================================================

const ANALYSIS_SESSION_STATUS = {
  /** Analyses are running */
  ANALYZING: "analyzing",
  /** All analyses done */
  COMPLETED: "completed",
  /** User is still in the wizard */
  DRAFT: "draft",
  /** One or more analyses failed */
  FAILED: "failed",
} as const;

/** Session lifecycle status */
export const analysisSessionStatusEnum = pgEnum("analysis_session_status", [
  ANALYSIS_SESSION_STATUS.ANALYZING,
  ANALYSIS_SESSION_STATUS.COMPLETED,
  ANALYSIS_SESSION_STATUS.DRAFT,
  ANALYSIS_SESSION_STATUS.FAILED,
]);

const DOCUMENT_CATEGORY = {
  INVOICE: "invoice",
  PURCHASE_ORDER: "purchase_order",
  RECEIPT: "receipt",
} as const;

/** Document category types */
export const documentCategoryEnum = pgEnum("document_category", [
  DOCUMENT_CATEGORY.INVOICE,
  DOCUMENT_CATEGORY.PURCHASE_ORDER,
  DOCUMENT_CATEGORY.RECEIPT,
]);

const ANALYSIS_STATUS = {
  /** Analysis has failed */
  FAILED: "failed",
  /** Analysis has not yet started */
  NOT_STARTED: "not_started",
  /** Analysis is currently running */
  RUNNING: "running",
  /** Analysis has successfully finished */
  SUCCEEDED: "succeeded",
} as const;

/** Individual analysis status */
export const analysisStatusEnum = pgEnum("analysis_status", [
  ANALYSIS_STATUS.FAILED,
  ANALYSIS_STATUS.NOT_STARTED,
  ANALYSIS_STATUS.RUNNING,
  ANALYSIS_STATUS.SUCCEEDED,
]);

// ============================================================================
// Table Definitions
// ============================================================================

/**
 * Groups the 3 documents together for a single wizard session.
 *
 * Created when user proceeds from Step 1 (upload) to Step 2 (categorization).
 * Status transitions: draft → analyzing → completed | failed
 */
export const analysisSessionsTable = pgTable("analysis_sessions", {
  ...DEFAULT_COLUMNS,

  status: analysisSessionStatusEnum("status")
    .default(ANALYSIS_SESSION_STATUS.DRAFT)
    .notNull(),
  completedAt: timestamp("completed_at", DEFAULT_TIMESTAMP_CONFIG),
});

/** Stores metadata for each uploaded file. */
export const uploadedDocumentsTable = pgTable("uploaded_documents", {
  ...DEFAULT_COLUMNS,

  // Storage
  storageKey: text("storage_key").unique().notNull(),

  // File metadata
  fileName: text("file_name").notNull(),
  fileSizeBytes: bigint("file_size_bytes", {
    mode: "number",
  }).notNull(),
  mimeType: text("mime_type").notNull(),

  // Categorization
  aiSuggestedCategory: documentCategoryEnum("ai_suggested_category").notNull(),

  /** Confidence score for the AI suggested category (0.00 to 1.00) */
  aiSuggestionConfidence: numeric("ai_suggestion_confidence", {
    precision: 3,
    scale: 2,
  }).notNull(),
  category: documentCategoryEnum("category").notNull(),

  // Relationships
  /**
   * A document must be associated to a session, so we can't have a
   * document without a session.
   */
  sessionId: uuid("session_id")
    .notNull()
    .references(() => analysisSessionsTable.id, {
      onDelete: "cascade",
    }),
});

const AZURE_ANALYZER_ID = {
  INVOICE: "prebuilt-invoice",
  PURCHASE_ORDER: "prebuilt-document",
  RECEIPT: "prebuilt-receipt",
} as const;

export const azureAnalyzerIdEnum = pgEnum("azure_analyzer_id", [
  AZURE_ANALYZER_ID.INVOICE,
  AZURE_ANALYZER_ID.PURCHASE_ORDER,
  AZURE_ANALYZER_ID.RECEIPT,
]);

const SUPPORTED_AZURE_API_VERSIONS = {
  "2025-11-01": "2025-11-01",
} as const;

export const azureApiVersionEnum = pgEnum("azure_api_version", [
  SUPPORTED_AZURE_API_VERSIONS["2025-11-01"],
]);

/** Stores analysis results and status for each document. */
export const documentAnalysesTable = pgTable("document_analyses", {
  ...DEFAULT_COLUMNS,

  status: analysisStatusEnum("status")
    .default(ANALYSIS_STATUS.NOT_STARTED)
    .notNull(),

  // Azure Content Understanding API columns
  analyzerId: azureAnalyzerIdEnum("analyzer_id").notNull(),
  apiVersion: azureApiVersionEnum("api_version").notNull(),
  operationId: text("operation_id").unique().notNull(),

  // Azure Content Understanding raw API response
  rawResponse: jsonb("raw_response").notNull(),

  // Relationships
  /**
   * An analysis must be associated to a document. Each document has exactly
   * one analysis (unique constraint).
   */
  documentId: uuid("document_id")
    .unique()
    .notNull()
    .references(() => uploadedDocumentsTable.id, {
      onDelete: "cascade",
    }),
});

// ============================================================================
// TypeScript Types
// ============================================================================

export type AnalysisSession = typeof analysisSessionsTable.$inferSelect;
export type NewAnalysisSession = typeof analysisSessionsTable.$inferInsert;

export type UploadedDocument = typeof uploadedDocumentsTable.$inferSelect;
export type NewUploadedDocument = typeof uploadedDocumentsTable.$inferInsert;

export type DocumentAnalysis = typeof documentAnalysesTable.$inferSelect;
export type NewDocumentAnalysis = typeof documentAnalysesTable.$inferInsert;

// Enum types
export type AnalysisSessionStatus =
  (typeof analysisSessionStatusEnum.enumValues)[number];
export type DocumentCategory = (typeof documentCategoryEnum.enumValues)[number];
export type AnalysisStatus = (typeof analysisStatusEnum.enumValues)[number];

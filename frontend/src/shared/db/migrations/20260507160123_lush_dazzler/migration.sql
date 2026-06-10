CREATE TYPE "analysis_session_status" AS ENUM('analyzing', 'completed', 'draft', 'failed');--> statement-breakpoint
CREATE TYPE "analysis_status" AS ENUM('failed', 'not_started', 'running', 'succeeded');--> statement-breakpoint
CREATE TYPE "azure_analyzer_id" AS ENUM('prebuilt-invoice', 'prebuilt-document', 'prebuilt-receipt');--> statement-breakpoint
CREATE TYPE "azure_api_version" AS ENUM('2025-11-01');--> statement-breakpoint
CREATE TYPE "document_category" AS ENUM('invoice', 'purchase_order', 'receipt');--> statement-breakpoint
CREATE TABLE "analysis_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"status" "analysis_session_status" DEFAULT 'draft'::"analysis_session_status" NOT NULL,
	"completed_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"status" "analysis_status" DEFAULT 'not_started'::"analysis_status" NOT NULL,
	"analyzer_id" "azure_analyzer_id" NOT NULL,
	"api_version" "azure_api_version" NOT NULL,
	"operation_id" text NOT NULL UNIQUE,
	"raw_response" jsonb NOT NULL,
	"document_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"storage_key" text NOT NULL UNIQUE,
	"file_name" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"ai_suggested_category" "document_category" NOT NULL,
	"ai_suggestion_confidence" numeric(3,2) NOT NULL,
	"category" "document_category" NOT NULL,
	"session_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_uploaded_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "uploaded_documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_session_id_analysis_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "analysis_sessions"("id") ON DELETE CASCADE;
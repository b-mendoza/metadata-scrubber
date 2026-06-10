# Database And Storage Reference

## Database

- PostgreSQL via Drizzle ORM.
- Schema is defined in `src/shared/db/db.schema.ts`.
- `pnpm run db:generate` — Generate Drizzle migrations.
- `pnpm run db:migrate` — Run migrations.

### Core tables

- `analysis_sessions` — Groups 3 documents for wizard session (`draft` -> `analyzing` -> `completed` or `failed`)
- `uploaded_documents` — File metadata, AI categorization, storage keys
- `document_analyses` — Azure Content Understanding API results per document

### Key enums

- `analysis_session_status`: `draft`, `analyzing`, `completed`, `failed`
- `document_category`: `invoice`, `purchase_order`, `receipt`
- `analysis_status`: `not_started`, `running`, `succeeded`, `failed`

## Storage

- S3-compatible object storage via Cloudflare R2.

### StorageProvider Interface

- Defined in `src/shared/storage/storage.types.ts`.
- `put(key, body, options)` uploads files.
- `getSignedUrl(key, expiresInSeconds)` generates presigned URLs.

### R2 Implementation

- `src/shared/storage/r2-storage.mod.ts` uses `R2Bucket` for uploads and `@aws-sdk/s3-request-presigner` for signed URLs.

### Required Environment Variables (Presigner)

- Runtime bindings (for example, `UPLOADS_BUCKET`) are intentionally excluded from this section.
- `STORAGE_ENDPOINT` — S3-compatible endpoint used by the AWS SDK presigner client.
- `STORAGE_REGION` — Region passed to the presigner client.
- `STORAGE_BUCKET` — Bucket name used when generating signed read URLs.
- `STORAGE_ACCESS_KEY_ID` — Access key used by the presigner client.
- `STORAGE_SECRET_ACCESS_KEY` — Secret key used by the presigner client.

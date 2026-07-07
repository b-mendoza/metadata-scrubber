# Database And Storage Reference

## Database

- PostgreSQL via Drizzle ORM; Drizzle config lives in `drizzle.config.ts`.
- Schema is defined in `src/shared/db/db.schema.server.ts`. It currently defines a single `users` table.
- The database client is **not wired into the application bindings yet** — the `db` binding is commented out in `src/shared/middlewares/application-bindings/application-bindings.mod.ts`. When you enable it, uncomment and thread it through the bindings rather than importing a client as a global.
- `pnpm run db:generate` — generate Drizzle migrations.
- `pnpm run db:migrate` — run migrations.

## File uploads

- `src/routes/api/upload.ts` accepts a `POST` with form data, validates the file with a Zod schema (`z.file().max(...).mime(...)`) against `MAX_FILE_SIZE_BYTES` and `UPLOADABLE_MIME_TYPES` from `src/domains/wizard/constants/wizard.mod.ts`, and returns file metadata plus a generated `storageKey`.
- **No storage backend is implemented yet.** The route generates a `storageKey` but does not persist the file anywhere. The S3 SDK dependencies (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) and `@uppy/react` are installed in anticipation, but there is no storage module under `src/`. Do not document or code against a storage provider until one exists.

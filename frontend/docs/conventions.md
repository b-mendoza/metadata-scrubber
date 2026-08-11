# Frontend File Structure and Conventions (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

Long-lived design guidance lives in [TypeScript Design Conventions](./agent/code-conventions.md). This file records only the current file structure and naming.

## Imports

- Use the `#/` path alias for `src/` imports (configured in `tsconfig.app.json`).

## File naming

- `*.mod.ts` / `*.mod.tsx` — module files (`.tsx` when the file contains JSX).
- `*.mod.server.ts` — server-only modules (env parsing, tRPC routers). The `.server` suffix keeps server code out of client bundles.
- `*.server.ts` — the three database files under `src/shared/db/` drop the `.mod` segment (`db.schema.server.ts` and siblings).
- `*.test.ts` / `*.test.tsx` — test files.
- Place a test file next to the module it tests (`vitest.config.ts` includes `src/**/*.test.{ts,tsx}`). `src/tests/` holds only setup and shared helpers.

See [architecture](./architecture.md) for the source layout (`src/domains/`, `src/shared/`, `src/routes/`).

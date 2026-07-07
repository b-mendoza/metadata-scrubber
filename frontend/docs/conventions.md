# Frontend File Structure And Conventions (current state)

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Imports

- Use the `#/` path alias for `src/` imports (configured in `tsconfig.app.json`).

## File naming

- `*.mod.ts` — module files.
- `*.mod.server.ts` — server-only modules (env parsing, database, tRPC routers). The `.server` suffix keeps server code out of client bundles.
- `*.test.ts` / `*.test.tsx` — test files.

See [architecture](./architecture.md) for the source layout (`src/domains/`, `src/shared/`, `src/routes/`).

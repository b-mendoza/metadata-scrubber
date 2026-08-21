# Current frontend file structure and conventions

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

Read the long-lived [TypeScript design conventions](./agent/code-conventions.md) for design guidance. Use this file for the current file structure and file names.

## Imports

- Use the `#/` path alias for imports from `src/`. `tsconfig.app.json` configures this alias.

## File names

- Use `*.mod.ts` and `*.mod.tsx` for module files. Use the `.tsx` extension when a module file contains JSX.
- Use `*.mod.server.ts` for server-only modules such as environment parsing and tRPC routers. The `.server` suffix keeps server code out of client bundles.
- Use `*.server.ts` for the three database files under `src/shared/db/`. These files omit the `.mod` segment. One file is `db.schema.server.ts`. The other two database files use the `*.server.ts` pattern.
- Use `*.test.ts` and `*.test.tsx` for test files.
- Put each test file next to the module that it tests. `vitest.config.ts` includes `src/**/*.test.{ts,tsx}`. Keep test files out of `src/tests/`. Use that directory for setup and shared helpers.

See the [architecture reference](./architecture.md) for the source layout under `src/domains/`, `src/shared/`, and `src/routes/`.

# Current frontend file structure and conventions

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

Read the long-lived [TypeScript design conventions](./agent/code-conventions.md) for design guidance. Use this file for the current file structure and file names.

## Imports

- Use the `#/` path alias for imports from `src/`. `tsconfig.app.json` configures this alias.

- `no-use-query` rejects runtime `useQuery` access from `@tanstack/react-query`. Use Suspense Query APIs where the application needs that data. Review the actual parent Suspense and error boundaries, route data needs, and retry behavior. Static lint does not prove those runtime properties.
- Put types in standalone `import type` declarations. Keep runtime bindings in separate declarations, even for the same module.
- Keep each imported name and local alias. A runtime binding named `type` is not a type-only import.
- Move inline type specifiers into a standalone type declaration, even when the original declaration has no runtime bindings. Keep a side-effect import when module initialization is required.

The workflow Ky client uses this split:

```ts
import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
```

- `separate-type-imports` enforces the import split above. It allows standalone named, default, and namespace type imports.

## File names

- Use `*.mod.ts` and `*.mod.tsx` for module files. Use the `.tsx` extension when a module file contains JSX.
- Use `*.mod.server.ts` for server-only modules such as environment parsing and tRPC routers. The `.server` suffix keeps server code out of client bundles.
- Use `*.server.ts` for `database.constants.server.ts`, `database.relations.server.ts`, and `database.schema.server.ts` under `src/shared/database/`. These files omit the `.mod` segment. `database.mod.server.ts` follows the `*.mod.server.ts` pattern.
- Use `*.test.ts` and `*.test.tsx` for test files.
- Put each test file next to the module that it tests. `vitest.config.ts` includes `src/**/*.test.{ts,tsx}`. Keep test files out of `src/tests/`. Use that directory for setup and shared helpers.

See the [architecture reference](./architecture.md) for the source layout under `src/domains/`, `src/shared/`, and `src/routes/`.

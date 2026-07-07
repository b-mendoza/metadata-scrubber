# TypeScript And File Conventions

## Imports

- Use the `#/` path alias for `src/` imports (configured in `tsconfig.app.json`).

## File Naming

- Use `*.mod.ts` for module files.
- Use `*.mod.server.ts` for server-only modules (env parsing, database, tRPC routers). The `.server` suffix keeps server code out of client bundles.
- Use `*.test.ts` / `*.test.tsx` for test files.

## Source Layout

- `src/domains/<domain>/` — feature code grouped by domain (`wizard`, `products`), each owning its components, constants, and routers.
- `src/shared/` — cross-domain code: `config`, `constants`, `db`, `libs` (tRPC), `middlewares`, `utils`.
- `src/routes/` — TanStack Router file-based routes; API routes under `src/routes/api/`.

## Design

- Prefer factory functions over classes when both are reasonable (for example, `createFooProvider()` over `new FooProvider()`).

## TypeScript

- Write interface methods in function property style: `method: (...) => ReturnType`.
- Avoid shorthand method signatures in interfaces.
- This is enforced by `@typescript-eslint/method-signature-style`.

# TypeScript And File Conventions

## Imports

- Use the `#/` path alias for `src/` imports.

## File Naming

- Use `*.mod.ts` for module files.
- Use `*.test.ts` for test files.

## Design

- Prefer factory functions over classes when both are reasonable (for example, `createFooProvider()` over `new FooProvider()`).

## TypeScript

- Write interface methods in function property style: `method: (...) => ReturnType`.
- Avoid shorthand method signatures in interfaces.
- This is enforced by `@typescript-eslint/method-signature-style`.

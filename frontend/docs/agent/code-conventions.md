# TypeScript Design Conventions

Long-lived guidance for TypeScript code in this service. Current file-naming and structure conventions are documented in the short-lived [conventions reference](../conventions.md).

## Design

- Prefer factory functions over classes when both are reasonable (for example, `createFooProvider()` over `new FooProvider()`). Factories compose better, avoid `this` pitfalls, and make dependencies explicit through parameters.

## Validation libraries

- Validate with Effect Schema in server-only code, and with Zod in code that ships to the browser. Effect's runtime is far too large to include in the client bundle, so keep every `effect` import — direct or transitive — on the server side; Zod is the client-side validator for that reason.
- When a module is shared by client and server code (for example, a constants module), keep it free of runtime imports from either validation library so each side can import it without pulling in the other's validator.

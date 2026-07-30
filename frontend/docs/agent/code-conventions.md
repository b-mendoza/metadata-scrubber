# TypeScript Design Conventions

Long-lived guidance for TypeScript code in this service. Current file naming and structure conventions live in the short-lived [conventions reference](../conventions.md).

## Design

- Prefer factory functions over classes when both are reasonable (for example, `createFooProvider()` over `new FooProvider()`). Factories compose better, avoid `this` pitfalls, and make dependencies explicit through parameters.

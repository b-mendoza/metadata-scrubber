# TypeScript design conventions

This file contains long-lived guidance for TypeScript design in the frontend. The short-lived [conventions reference](../conventions.md) records the current file names and structure.

## Mapped dependency failures

- Use a `neverthrow` `Result` or `ResultAsync` for an asynchronous dependency operation when a server handler intentionally maps the failure.
- Convert the dependency failure to a mapped error value at the operation.
- Consume the `Result` at the route or tRPC boundary.
- Throw the mapped error at that boundary.
- Preserve the original failure in `cause`.
- Let intentional Zod boundary validation throw outside a `Result` unless the handler maps that validation failure.
- Review every `Result` consumption. The lint checks do not cover every consumption form.

## External input

Validate external input with Zod at each boundary.

## HTTP requests

- Use ky through the shared backend client for backend calls.
- Supply a full request-scoped URL and a per-request signal at each call site.
- Extend the client for one use case only when that use case needs a different transport policy.

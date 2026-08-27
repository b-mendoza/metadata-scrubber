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

- Use ky for HTTP calls from frontend server code.
- Keep each use case's HTTP request policy with that use case.
- Add shared HTTP configuration only when several real call sites need one policy.

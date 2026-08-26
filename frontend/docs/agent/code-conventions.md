# TypeScript design conventions

This file contains long-lived guidance for TypeScript design in the frontend. The short-lived [conventions reference](../conventions.md) records the current file names and structure.

## Promise control flow

- Use `async` and `await` for Promise control flow.
- Preserve a wrapped error's original failure in `cause`.

## External input

Validate external input with Zod at each boundary.

## HTTP requests

- Use ky for HTTP calls from frontend server code.
- Keep each use case's HTTP request policy with that use case.
- Add shared HTTP configuration only when several real call sites need one policy.

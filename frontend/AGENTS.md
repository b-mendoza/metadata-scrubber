# Agent Guide — frontend

**Package manager:** `pnpm`

## Deployment target

The service deploys to Vercel as a TanStack Start application, and not on a server that you control. Design and review with these properties:

- One instance can serve many requests at the same time. Do not keep per-request state in module scope.
- The platform injects the backend's URL as a service binding; read it from the validated environment, never from a hardcoded host.
- The platform bounds request time and instance memory. Bound work that holds a large buffer for each request.

## Always

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh` before doing anything else.
- Lint check (run after a substantive change): `pnpm run lint`.
- Test suite (run before committing): `pnpm run test`.

## Open when relevant (long-lived)

- [TypeScript design conventions](docs/agent/code-conventions.md) — design guidance such as preferring factory functions over classes.
- [Testing — frontend specifics](docs/agent/testing-principles.md) — Vitest assertion practices and shared render helpers for component tests.

## Current-state references (short-lived; verify against the code)

- [Architecture](docs/architecture.md) — framework, source layout, server boundaries, bindings, database, uploads, testing status.
- [File structure and conventions](docs/conventions.md) — path alias and file naming.
- [Commands](docs/commands.md) — full command reference.
- [Known issues](docs/known-issues/README.md) — dependency and tooling issues affecting builds, with workarounds.

Cross-cutting long-lived guidance (naming, code design, testing, workflow, verification) lives in the [root Agent Guide](../AGENTS.md) and applies to this service.

# Agent Guide — frontend

**Package manager:** `pnpm`

## Always

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh` before doing anything else.
- After substantive changes, run `pnpm run lint`.
- Before committing, run `pnpm run test`.

## Open when relevant (long-lived)

- [TypeScript design conventions](docs/agent/code-conventions.md)
- [Testing — frontend specifics](docs/agent/testing-principles.md)

## Current-state references (short-lived; verify against the code)

- [Architecture](docs/architecture.md) — framework, source layout, server boundaries, bindings, database, uploads, testing status.
- [File structure and conventions](docs/conventions.md) — path alias and file naming.
- [Commands](docs/commands.md) — full command reference.

Cross-cutting long-lived guidance (naming, code design, testing, workflow, verification) lives in the [root Agent Guide](../AGENTS.md) and applies to this service.

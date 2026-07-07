# Agent Guide

**Package manager:** `pnpm`

## Always

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh` before doing anything else.
- After substantive changes, run `pnpm run lint` (`eslint`, `oxfmt`, `oxlint`, `tsc`).
- Before committing, run `pnpm run test` (Vitest).

## Open When Relevant

- [Build and quality commands](docs/agent/build-and-quality.md)
- [TypeScript and file conventions](docs/agent/code-conventions.md)
- [Server architecture and bindings](docs/agent/architecture-and-bindings.md)
- [Database and storage reference](docs/agent/data-and-storage.md)
- [Testing — frontend specifics](docs/agent/testing-principles.md)

General naming, code design, testing, workflow, and verification guidance lives in the [root Agent Guide](../AGENTS.md) and applies here.

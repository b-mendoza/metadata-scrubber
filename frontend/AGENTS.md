# Agent Guide

**Package manager:** `pnpm`

## Always

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh` before doing anything else.
- After substantive changes, run `pnpm run lint` (`oxfmt`, `tsc`, `eslint`).

## Open When Relevant

- [Build and quality commands](docs/agent/build-and-quality.md)
- [TypeScript and file conventions](docs/agent/code-conventions.md)
- [Server architecture and bindings](docs/agent/architecture-and-bindings.md)
- [Database and storage reference](docs/agent/data-and-storage.md)
- [Testing principles](docs/agent/testing-principles.md)
- [Task scoping and workflow](docs/agent/workflow-and-decomposition.md)

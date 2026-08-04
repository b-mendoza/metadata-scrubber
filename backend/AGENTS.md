# Agent Guide — backend

Go HTTP service that receives uploaded files and returns metadata-free bytes.

**Task runner:** [Task](https://taskfile.dev) — `task <target>` is the command interface for this service.

## Always

- Lint check (run after a substantive change): `task lint`.
- Test suite (run before committing): `task test`.

## Current-state references (short-lived; verify against the code)

- [Architecture](docs/architecture.md) — package layout and runtime wiring.
- [Commands](docs/commands.md) — full task-runner reference and how tooling owns generated files.

Cross-cutting long-lived guidance (naming, code design, testing, workflow, verification) lives in the [root Agent Guide](../AGENTS.md) and applies to this service.

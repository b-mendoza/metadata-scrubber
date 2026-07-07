# Agent Guide — backend

Go HTTP service that receives uploaded files and returns metadata-free bytes.

**Task runner:** [Task](https://taskfile.dev) — `task <target>` is the command interface for this service.

## Always

- After a substantive change, run `task lint` (read-only lint and formatting check, CI-safe).
- Before committing, run `task test` (suite with the race detector and coverage).
- The linter configuration is the enforced source of truth for style. Prefer fixing a finding over suppressing it; suppress inline only when the rule is genuinely wrong for the case, and say why.

## Current-state references (short-lived; verify against the code)

- [Architecture](docs/architecture.md) — package layout and runtime wiring.
- [Commands](docs/commands.md) — full task-runner reference and how tooling owns generated files.

Cross-cutting long-lived guidance (naming, code design, testing, workflow, verification) lives in the [root Agent Guide](../AGENTS.md) and applies to this service.

# Agent Guide — backend

Go HTTP service that receives uploaded files and returns metadata-free bytes.

**Task runner:** [Task](https://taskfile.dev) — commands live in `Taskfile.yml`. The required Go version is pinned in `go.mod`.

## Always

- After a substantive change, run `task lint` (runs `golangci-lint` and verifies formatting, read-only and CI-safe).
- Before committing, run `task test` (runs the suite with the race detector and coverage).

## Open when relevant

- [Commands](docs/agent/commands.md) — full Task reference (build, run, fix, tidy) and how tooling owns generated files.
- [Conventions](docs/agent/conventions.md) — package layout and the enforced style authority.

Naming, code design, testing principles, workflow, and verification are cross-cutting and live in the [root Agent Guide](../AGENTS.md). They apply to this service.

# Agent Guide

Go HTTP service that receives uploaded files and returns metadata-free bytes. Package layout lives under `internal/` (`scrub`, `handler`, `httpx`, `bindings`, `config`).

**Language:** Go (see the `go` directive in `go.mod` for the required version)
**Task runner:** [Task](https://taskfile.dev) — commands are defined in `Taskfile.yml`

## Always

- After substantive changes, run `task lint`. It runs `golangci-lint` and verifies formatting without modifying files, so it is safe in CI and locally.
- Before committing, run `task test`. It runs the suite with the race detector and coverage (`go test -race -cover ./...`).
- Let tooling own generated files: run `task tidy` (`go mod tidy`) to change dependencies, and `task fix` to apply lint auto-fixes and formatting. Do not hand-edit `go.sum` or reformat by hand.

## Task reference

| Command | What it does |
| --- | --- |
| `task build` | Compile the service into the `metadata-scrubber` binary. |
| `task run` | Run the service locally (`go run .`). |
| `task test` | Run the suite with the race detector and coverage. |
| `task lint` | Lint and verify formatting, read-only (CI-safe). |
| `task fix` | Apply lint auto-fixes, then format the source (writes files). |
| `task tidy` | Add missing and remove unused module dependencies. |

## Conventions

Naming conventions and the general working posture live in the [root Agent Guide](../AGENTS.md). Read that first; it applies to this service. The linter config in `.golangci.yml` is the enforced source of truth for style, so prefer fixing lint findings over suppressing them.

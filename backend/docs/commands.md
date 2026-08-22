# Current backend commands

> **Short-lived reference.** This file describes the current state of the tooling. Update it when the tooling changes. If this file does not match the code, follow the code.

`Taskfile.yml` defines all commands as [Task](https://taskfile.dev) targets.

| Command | What it does |
| --- | --- |
| `task build` | Compile the service into the `metadata-scrubber` binary. |
| `task run` | Run the service on the local machine with `go run .`. |
| `task test` | Run the service and analyzer suites with the race detector and coverage by using `go test -race -cover ./...`. |
| `task test:coverage` | Run the suite and write `coverage.out`, which Git ignores. Print the per-function coverage summary after the test run. |
| `task test:watch` | This target re-runs the suite when Go sources change. It re-runs the suite when `testdata` fixtures or module files change. |
| `task lint:build` | Build the custom `golangci-lint` binary when its inputs change. |
| `task lint` | Run the custom `golangci-lint` binary with both backend analyzers and verify formatting. This target does not write files. |
| `task security` | Use `govulncheck` to scan dependencies for known vulnerabilities. This target uses the network. |
| `task fix` | Apply lint auto-fixes before formatting the source. This target writes files. |
| `task tidy` | Use `go mod tidy` to add missing module dependencies and remove unused module dependencies. |

## Use tooling to update generated files

Run `task tidy` to update `go.mod` and `go.sum`. Run `task fix` to rewrite source files. Do not edit `go.mod` or `go.sum` by hand. See the root [Verifying your work](../../docs/agent/verification.md) guide for this rule.

## Environment

`task run` starts the process with your shell environment. `task run` has no `.env` loader. Before startup, the service validates `PORT` and the required `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. `PORT` defaults to 8080. `backend/.env.example` lists these variables with example values.

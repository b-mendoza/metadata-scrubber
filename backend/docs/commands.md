# Backend Commands (current state)

> **Short-lived reference.** This file describes the current state of the tooling and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

All commands are [Task](https://taskfile.dev) targets defined in `Taskfile.yml`.

| Command | What it does |
| --- | --- |
| `task build` | Compile the service into the `metadata-scrubber` binary. |
| `task run` | Run the service locally (`go run .`). |
| `task test` | Run the service and analyzer suites with the race detector and coverage (`go test -race -cover ./...`). |
| `task test:coverage` | Run the suite writing `coverage.out` (gitignored), then print the per-function coverage summary. |
| `task test:watch` | Re-run the suite whenever Go sources, `testdata` fixtures, or module files change. |
| `task lint:build` | Build the custom `golangci-lint` binary when its inputs change. |
| `task lint` | Run the custom `golangci-lint` binary with three backend analyzers and verify formatting. This command is read-only. |
| `task security` | Scan dependencies for known vulnerabilities with `govulncheck`. This command uses the network. |
| `task fix` | Apply lint auto-fixes, then format the source; writes files. |
| `task tidy` | Add missing and remove unused module dependencies (`go mod tidy`). |

## Let tooling own generated files

The targets above regenerate `go.sum` and rewrite source for you; see the root [Verifying your work](../../docs/agent/verification.md) guide on not hand-editing tool-managed files.

## Environment

`task run` starts the process with your shell environment; there is no `.env` loader. The service validates `PORT` (default 8080) and the required `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` before startup. `backend/.env.example` lists them with example values.

# Backend Commands (current state)

> **Short-lived reference.** This file describes the current state of the tooling and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

All commands are [Task](https://taskfile.dev) targets defined in `Taskfile.yml`.

| Command | What it does |
| --- | --- |
| `task build` | Compile the service into the `metadata-scrubber` binary. |
| `task run` | Run the service locally (`go run .`). |
| `task test` | Run the suite with the race detector and coverage (`go test -race -cover ./...`). |
| `task test:coverage` | Run the suite writing `coverage.out` (gitignored), then print the per-function coverage summary. |
| `task test:watch` | Re-run the suite whenever Go sources, `testdata` fixtures, or module files change. |
| `task lint` | Check module tidiness (`lint:deps`), lint, and verify formatting; read-only (CI-safe). |
| `task lint:deps` | Verify `go.mod`/`go.sum` are tidy (`go mod tidy -diff`) and module checksums match (`go mod verify`); read-only. |
| `task vuln` | Scan for known vulnerabilities reachable from this module's code (`govulncheck`); queries the Go vulnerability database over the network. |
| `task fix` | Apply lint auto-fixes (`fix:lint`), then format the source (`fix:fmt`); writes files. |
| `task tidy` | Add missing and remove unused module dependencies (`go mod tidy`). |

## Let tooling own generated files

Change dependencies with `task tidy` and apply formatting or lint auto-fixes with `task fix`. These regenerate `go.sum` and rewrite source for you; see the root [Verifying your work](../../docs/agent/verification.md) guide on not hand-editing tool-managed files.

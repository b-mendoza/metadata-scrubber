# Commands

All commands are [Task](https://taskfile.dev) targets defined in `Taskfile.yml`.

| Command | What it does |
| --- | --- |
| `task build` | Compile the service into the `metadata-scrubber` binary. |
| `task run` | Run the service locally (`go run .`). |
| `task test` | Run the suite with the race detector and coverage (`go test -race -cover ./...`). |
| `task lint` | Lint and verify formatting, read-only (CI-safe). |
| `task fix` | Apply lint auto-fixes, then format the source (writes files). |
| `task tidy` | Add missing and remove unused module dependencies (`go mod tidy`). |

## Let tooling own generated files

Change dependencies with `task tidy` and apply formatting or lint auto-fixes with `task fix`. These regenerate `go.sum` and rewrite source for you; see the root [Verifying your work](../../../docs/agent/verification.md) note on not hand-editing tool-managed files.

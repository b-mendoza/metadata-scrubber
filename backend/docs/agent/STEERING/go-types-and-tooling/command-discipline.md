# Run the defined verification commands

Scope: backend changes and tests. Use [`Taskfile.yml`](../../../../Taskfile.yml) targets from `backend/`. Preserve failure signals and let tooling update generated files.

## Do's

### Correct: Run lint after substantive changes

`task lint` checks source without rewriting it. Its `lint:build` dependency can build the `custom-gcl` artifact when inputs change. The custom binary runs both backend analyzers and verifies formatting.

```sh
task lint
```

### Correct: Run tests before an authorized commit

`task test` runs the service and analyzer suites with the race detector and coverage. Report only checks actually run, including failures and warnings. A green check does not authorize a commit.

```sh
task test
```

### Correct: Wait for the test condition instead of sleeping

[`lint/nohiddentestsignal`](../../../../lint/nohiddentestsignal/nohiddentestsignal.go) rejects `testing` skip calls and `time.Sleep` calls in Go test files. Fail on missing prerequisites. Synchronize on the needed condition and bound the wait.

Context: [`handler_admission_capacity_test.go`](../../../../internal/handler/handler_admission_capacity_test.go), after installing the `enteredWait` signal and starting the request. `cancel` is the request's cancellation function.

```go
select {
case <-enteredWait:
case <-time.After(time.Second):
	require.FailNow(t, "timed out waiting for request to reach the acquisition select")
}
cancel()
```

### Correct: Let tooling update module files and source formatting

Use `task tidy` for `go.mod` and `go.sum`. Use `task fix` only when source rewriting is intended; it applies lint fixes, then formats. Dependency additions still require prior approval.

```sh
task tidy
```

## Don'ts

### Wrong: Hide failing or incomplete verification

```sh
task test || true
```

Wrong Go test calls, rejected by `nohiddentestsignal`.

```go
t.Skip("prerequisite missing")
time.Sleep(time.Second)
```

`Skipf` and `SkipNow` are also rejected. Fix the prerequisite or synchronization; do not suppress the analyzer.

### Wrong: Hand-edit generated module files or invent targets

```text
Change go.mod and go.sum in an editor instead of running task tidy.
Document task deploy even though Taskfile.yml defines no deploy target.
```

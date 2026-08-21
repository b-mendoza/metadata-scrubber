# Backend agent guide

The backend is a Go HTTP service. It grants direct uploads to private storage. It inspects stored PDF files. It returns download grants for metadata-free copies.

Use [Task](https://taskfile.dev) as the command interface for this service. Run each target as `task <target>`.

## Deployment target

Vercel Fluid compute runs the service in a stateless container. You do not control the server. Design and review the service for these conditions:

- One instance serves many requests at the same time. The platform fills a warm instance before it starts a new instance. The platform does not isolate requests from each other.
- Each instance has a small fixed memory limit. Each instance has few CPUs. Limit work that holds a large buffer for each request. An out-of-memory kill stops the process and fails every request in that process.
- The platform sets each request time limit in minutes. Do not depend on client disconnection to release a resource before that time limit expires.
- The platform adds instances when current instances are busy. Refuse work that you cannot start so the platform can add instances.

## Always

- Run `task lint` after a substantive change.
- Run `task test` before you commit.

The custom analyzers ban the `any` and `interface{}` forms of the empty interface in application code. Give every generic an explicit, meaningful constraint. The constraint must name the accepted types or the operations that the generic code requires.

## Short-lived references

These short-lived references describe the current code. Verify them against the code.

- [Architecture](docs/architecture.md) describes the package layout and runtime wiring.
- [Commands](docs/commands.md) lists all Task targets and explains how tooling manages generated files.

The [root agent guide](../AGENTS.md) contains the long-lived guidance for naming, code design, testing, workflow, and verification. Follow that guidance in this service.

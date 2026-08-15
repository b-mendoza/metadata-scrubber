# Agent Guide — backend

Go HTTP service that grants direct uploads to private storage, inspects stored PDF files, and returns download grants for metadata-free copies.

**Task runner:** [Task](https://taskfile.dev) — `task <target>` is the command interface for this service.

## Deployment target

The service runs as a stateless container on Vercel Fluid compute, and not on a server that you control. Design and review with these properties:

- One instance serves many requests at the same time, and the platform fills a warm instance before it starts a new one. Requests are not isolated from each other.
- An instance has a small fixed memory allowance and few CPUs. Bound work that holds a large buffer for each request, because an out-of-memory kill stops the process and fails every request in it.
- The platform time limit for one request is minutes. Do not use client disconnection as a fast way to release a resource.
- The platform adds instances when the instances are busy. Refuse work that you cannot start, so that the platform can scale out.

## Always

- Lint check (run after a substantive change): `task lint`.
- Test suite (run before committing): `task test`.

The custom analyzers ban the empty interface (`any` and `interface{}`) in application code. Give every generic an explicit, meaningful constraint.

## Current-state references (short-lived; verify against the code)

- [Architecture](docs/architecture.md) — package layout and runtime wiring.
- [Commands](docs/commands.md) — full task-runner reference and how tooling owns generated files.

Cross-cutting long-lived guidance (naming, code design, testing, workflow, verification) lives in the [root Agent Guide](../AGENTS.md) and applies to this service.

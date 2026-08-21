# Frontend agent guide

Use `pnpm` as the package manager.

## Deployment target

Vercel runs this service as a TanStack Start application. You do not control the Vercel server. Use these deployment properties when you design or review frontend code.

- One instance can serve many requests at the same time. Design request handling for concurrent requests.
- Vercel injects the backend's URL as a service binding.
- Vercel limits each request's run time and each instance's memory. Limit work that keeps a large buffer in memory for each request.

## Always

- If Node.js (see `.nvmrc`) or pnpm is missing or has the wrong version, run `scripts/setup-node.sh` before any other work.
- After a substantive change, run `pnpm run lint`. See the [lint check](docs/commands.md#core-commands).
- Before you commit, run `pnpm run test`. See the [test suite](docs/commands.md#core-commands).
- Write specific and explicit application code for each use case. Accept duplication instead of creating a general helper.
- Give every generic an explicit, meaningful constraint. The constraint must name the accepted types or the operations that the generic code requires.

## Open when relevant

- Read [TypeScript design conventions](docs/agent/code-conventions.md) for long-lived TypeScript design guidance.

## Short-lived references

Verify these short-lived references against the code.

- [Architecture](docs/architecture.md) describes the framework, source layout, server boundaries, bindings, database, uploads, and testing status.
- [File structure and conventions](docs/conventions.md) describes the path alias and file names.
- [Commands](docs/commands.md) is the full service command reference.
- [Known issues](docs/known-issues/README.md) describes dependency and tooling issues that affect builds and their workarounds.

Read the [root agent guide](../AGENTS.md) for long-lived guidance about code design and testing. Use it for workflow and verification guidance. Apply that guidance to this service.

# Backend agent guide

This guide describes general practices. The code is the source of truth. This guide does not override the code.

[Taskfile.yml](Taskfile.yml) defines the available commands.

## Runtime limits

- Account for runtime limits when you design or review code.
- Keep resource use within the runtime's limits.
- Bound resource lifetimes even when cancellation does not stop work.
- Keep accepted work within available capacity.

## Code design

- Give every generic an explicit, meaningful constraint. The constraint must name the accepted types or the operations that the generic code requires.
- Keep a suppression only where an external API boundary forces it. State the reason.

## Documentation

The architecture reference describes the current code. Verify it against the code. The conventions guide describes general practices.

- [Architecture](docs/architecture.md) describes the package layout and runtime wiring.
- [Conventions](docs/conventions.md) describes general design practices.

Read the [root agent guide](../AGENTS.md) for shared general practices. Follow that guidance in this service.

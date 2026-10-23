# Backend agent guide

This guide describes general practices. For facts, the code is the source of truth. Decided conventions in docs/conventions.md define the chosen patterns.

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

The architecture reference describes the current code. Verify it against the code. Follow the decided conventions in new and changed code.

- [Architecture](docs/architecture.md) describes the package layout and runtime wiring.
- Read and follow [Conventions](docs/conventions.md) before changing backend code.

Read the [root agent guide](../AGENTS.md) for shared general practices. Follow that guidance in this service.

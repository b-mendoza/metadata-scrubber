# Frontend agent guide

This guide describes general practices, not specific use cases or implementations. A guide does not override the code.

Use the package manager and version declared by the project manifest.

[package.json](package.json) defines the available commands and scripts.

## Runtime limits

- Account for the runtime's limits when you design or review code.
- Prevent concurrent work from interfering with other work.
- Keep resource use within the runtime's limits.

## Always

- Check the required tools and versions before work. Use the configured setup process when a tool is missing or has the wrong version.
- Fix the cause of a failed check. A narrow exception is acceptable when it has a stated reason. Do not use a broad exception.
- Give every generic an explicit, meaningful constraint. The constraint must name the accepted types or the operations that the generic code requires.
- Use the formatter configured by the project.

## Open when relevant

- Read the [frontend design guide](docs/agent/code-conventions.md) for general practices.

## Factual references

These references describe current facts. Check them against the code.

- [Architecture](docs/architecture.md) describes the framework, source layout, server boundaries, bindings, uploads, and testing status.
- [Known issues](docs/known-issues/README.md) describes observed dependency and tooling issues.
- [Lint plugin](oxlint-plugin-metadata-scrubber/README.md) describes the rules and their static limits.

Read the [root agent guide](../AGENTS.md) for shared general practices.

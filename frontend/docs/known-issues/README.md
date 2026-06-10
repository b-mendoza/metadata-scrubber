# Known Issues

This folder records dependency, tooling, and framework issues that affect local development or production builds.

## Active Issues

| Issue                                                                                                                 | Area          | Status                | Workaround                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- | ----------------------------------------------- |
| [Railway gzip buffering of streamed HTML](./railway-streaming-html-gzip-buffering.md)                                 | Deployment    | Active mitigation     | Disable response transforms and proxy buffering |
| [`@tanstack/devtools-vite@0.7.0` production build syntax error](./tanstack-devtools-vite-0-7-0-build-syntax-error.md) | Build tooling | Active upstream issue | Pin `@tanstack/devtools-vite` to `0.6.1`        |

## Adding Entries

Each issue entry should include:

- The affected command or workflow.
- The observed symptom and error message.
- The suspected or confirmed root cause.
- The package versions involved.
- The current mitigation.
- Links to upstream issues, release notes, or local reproduction notes.

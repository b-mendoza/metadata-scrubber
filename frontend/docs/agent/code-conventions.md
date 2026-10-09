# Frontend design practices

This guide describes general practices, not specific use cases or implementations. The code is the source of truth. This guide does not override the code.

## Dependencies and failures

- Keep each operation focused on one purpose.
- Keep a dependency out of a runtime that does not need it. Check every path that can reach another runtime.
- Do not require tool consumers to install dependencies they do not need.
- Report a failure in terms the caller understands. Preserve the original cause.
- Do not read a consumed resource again.
- Keep maintenance tools independent of resources they remove.
- Report a failure at the boundary responsible for it.
- Keep validation and failure handling under one clear owner.

## Data and resources

- Wait only for data required to show useful content. Treat other data as optional until evidence shows otherwise.
- Stop dependent work when its owner cancels it.
- Match resource creation and release to the lifetime of its owner.

## Changes and checks

- Preserve program meaning when changing syntax.
- Preserve limits and accepted inputs when changing dependencies.
- Reject invalid input without silently changing it.
- Validate external data against its actual contract. Reject missing required data. Do not hide invalid input with a default.
- Do not let control flow skip a required assertion.
- Keep checks able to detect failures. Do not narrow their scope to hide a failure.
- Keep automated-check coverage aligned with the code it must inspect.

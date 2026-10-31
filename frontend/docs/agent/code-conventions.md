# Frontend design practices

This guide describes general practices. The code is the source of truth. This guide does not override the code.

## Dependencies and failures

- Keep each operation on one purpose.
- Keep a dependency out of a runtime that does not need it. Check every path that can reach another runtime.
- Do not make tool users install dependencies they do not need.
- Report a failure in words the caller understands. Keep the original cause.
- Do not read a used-up resource again.
- Keep cleanup tools free of the files they delete.
- Report a failure at the boundary that owns it.
- Keep validation and failure handling under one owner.

## Data and resources

- Follow [Route data](../conventions.md#route-data) for loader waits, query reads, and client access.
- Stop work when its owner cancels it.
- Match resource creation and release to the lifetime of its owner.

## Changes and checks

- Keep program meaning when you change syntax.
- Keep limits and accepted inputs when you change dependencies.
- Reject invalid input. Do not change it in silence.
- Check external data against its real contract. Reject missing required data. Do not hide invalid input with a default.
- Do not let control flow skip a required check.
- Keep checks able to find failures. Do not shrink their scope to hide a failure.
- Keep automated-check coverage aligned with the code it must inspect.

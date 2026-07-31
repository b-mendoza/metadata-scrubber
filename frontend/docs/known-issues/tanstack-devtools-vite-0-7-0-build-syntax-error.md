# `@tanstack/devtools-vite@0.7.0` Production Build Syntax Error

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Summary

**Resolved.** `@tanstack/devtools-vite` is now on `0.8.3`, where `pnpm run build` completes cleanly (verified 2026-07-30: devtools code is stripped from `src/routes/__root.tsx` without the invalid-JSX regression). Version `0.7.0` broke the build by producing invalid JSX while removing devtools code from production bundles; the project pinned `0.6.1` until the fix landed.

The failure was reproduced in this repository after upgrading to `@tanstack/devtools-vite@0.7.0`.

## Affected Workflow

```bash
pnpm run build
```

## Observed Error

The build fails during TanStack Router code splitting:

```bash
[plugin tanstack-router:code-splitter:compile-reference-file] src/routes/__root.tsx:84:18
SyntaxError: Unexpected token (84:18)
```

The build output also logs:

```bash
[@tanstack/devtools-vite] Removed devtools code from: /src/routes/__root.tsx
```

## Root Cause

The direct parse error is raised by `tanstack-router:code-splitter:compile-reference-file`, but the invalid syntax is created earlier by `@tanstack/devtools-vite@0.7.0`.

In [`src/routes/__root.tsx`](../../src/routes/__root.tsx), the root shell renders TanStack Devtools only in development:

```text
{import.meta.env.DEV ? (
  <TanStackDevtools config={DEVTOOLS_CONFIG} plugins={PLUGINS} />
) : null}
```

During a production build, `@tanstack/devtools-vite@0.7.0` removes the `<TanStackDevtools />` JSX node but leaves the surrounding conditional branch in an invalid state:

```text
{import.meta.env.DEV ? (
          ) : null}
```

TanStack Router then receives this already-invalid transformed route file and reports an `Unexpected token` while compiling the reference route.

## Upstream Tracking

- TanStack Devtools issue: [TanStack/devtools#444](https://github.com/TanStack/devtools/issues/444)

That issue reports the same regression class: `@tanstack/devtools-vite@0.7.0` strips devtools JSX during production builds but can leave invalid syntax behind.

## Local Mitigation

Historical: the project pinned `0.6.1` until upstream fixed the regression; the pin was lifted at `0.8.3`.

## Revisit Criteria

Met — a fixed version was published and adopted (`0.8.3`); the pin is lifted.

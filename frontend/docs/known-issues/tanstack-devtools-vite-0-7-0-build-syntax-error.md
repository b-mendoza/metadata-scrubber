# `@tanstack/devtools-vite@0.7.0` Production Build Syntax Error

## Summary

`@tanstack/devtools-vite` is pinned to `0.6.1` because version `0.7.0` can break `pnpm run build` by producing invalid JSX while removing devtools code from production bundles.

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

Pin `@tanstack/devtools-vite` to `0.6.1`.

This keeps the Vite devtools integration available while avoiding the `0.7.0` production build transform regression.

## Revisit Criteria

Re-evaluate this pin when one of the following is true:

- A newer `@tanstack/devtools-vite` version is published with a fix for TanStack/devtools#444.
- The local root shell no longer renders `<TanStackDevtools />` inside a conditional JSX expression that can be partially stripped.
- The project disables production devtools stripping with `removeDevtoolsOnBuild: false` and accepts the resulting bundle behavior.

After changing the pin or mitigation, verify with:

```bash
pnpm run build
pnpm run lint
```

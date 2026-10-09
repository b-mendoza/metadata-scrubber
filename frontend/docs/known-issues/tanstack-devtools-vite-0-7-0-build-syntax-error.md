# `@tanstack/devtools-vite@0.7.0` production build syntax error

> **Factual reference.** This file records an observed tool issue. Update it when its evidence changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Summary

**Resolved.** We use `@tanstack/devtools-vite@0.8.5`. On 2026-07-30, `pnpm run build` completed without errors. The plugin stripped devtools code from `src/routes/__root.tsx` without the invalid-JSX regression.

History: `@tanstack/devtools-vite@0.7.0` removed devtools code from production bundles. During that removal, it created invalid JSX. The production build failed with a syntax error. We reproduced the failure in this repository after the upgrade to `0.7.0`. We pinned `0.6.1` until the TanStack Devtools maintainers released the fix.

## Affected workflow

```bash
pnpm run build
```

## Observed error

With `@tanstack/devtools-vite@0.7.0`, the build failed during TanStack Router code splitting:

```bash
[plugin tanstack-router:code-splitter:compile-reference-file] src/routes/__root.tsx:84:18
SyntaxError: Unexpected token (84:18)
```

With `@tanstack/devtools-vite@0.7.0`, the build output logged a second message:

```bash
[@tanstack/devtools-vite] Removed devtools code from: /src/routes/__root.tsx
```

## Root cause

The `tanstack-router:code-splitter:compile-reference-file` plugin raises the direct parse error. `@tanstack/devtools-vite@0.7.0` creates the invalid syntax before that step.

In [`src/routes/__root.tsx`](../../src/routes/__root.tsx), the root shell renders TanStack Devtools in development. The root shell does not render TanStack Devtools in other environments:

```text
{import.meta.env.DEV ? (
  <TanStackDevtools config={DEVTOOLS_CONFIG} plugins={PLUGINS} />
) : null}
```

During a production build, `@tanstack/devtools-vite@0.7.0` removes the `<TanStackDevtools />` JSX node. It leaves the surrounding conditional branch in this invalid state:

```text
{import.meta.env.DEV ? (
          ) : null}
```

TanStack Router receives the invalid transformed route file. It reports an `Unexpected token` while it compiles the reference route.

## Upstream tracking

- The TanStack Devtools maintainers track the regression in [TanStack/devtools#444](https://github.com/TanStack/devtools/issues/444).

## Local workaround

We pinned `0.6.1` until the TanStack Devtools maintainers fixed the regression. We removed the historical `0.6.1` workaround pin. The package now uses the exact version `0.8.5`.

## Revisit criteria

Recheck this reference when its evidence or dependencies change.

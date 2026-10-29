# Metadata Scrubber Oxlint plugin

## Checks

`check-fixtures.ts` uses `fixture.config.json`, not the main Oxlint config. It checks that each positive fixture has no diagnostics from the rule under test. It compares the exact ordered negative messages. It validates the tool output, including `diagnostics` and a positive `number_of_files`. It rejects diagnostic text with leading or trailing whitespace. The fixture check runs separately from the main lint and test checks.

Directory fixtures run from their own root, so their `src/` paths match real source paths. Single-file fixtures still run from the frontend root. The check validates each diagnostic file name and sorts diagnostics by file name. It keeps message order within each file.

## Rules

- `no-classes` requires plain functions and objects instead of class declarations and class expressions. It also rejects classes that extend `Error`.
- `no-discarded-result` rejects expression statements that discard known `neverthrow` results, including `await`, `void`, and result method chains. It resolves named and namespace imports, including renamed imports.
- `no-expect-type-of` requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls, including renamed imports.
- `no-late-request-body-read` rejects request body reads from Vitest mock call records. It follows the first call argument and its `request` property through local `const` aliases and destructuring. Read or clone the body in the MSW handler instead.
- `no-module-scope-http-client` rejects module-scope `ky.create`, `ky.extend`, and calls to imported factories from `#/shared/libs/ky/`. It follows import aliases and local `const` aliases. Test files remain exempt because test setup can own a shared client without serving requests.
- `no-lifecycle-hook-names` rejects function declarations and function-valued variable declarations with mount-timing hook names. A suffix must start with an uppercase letter, digit, or underscore. It rejects `useMountUploader` but allows `useMountedState`, which describes state rather than mount timing.
- `no-mutable-module-state-in-server-code` rejects module-scope `let` and `var` declarations in server modules.
- `no-query-client-props` rejects `trpc` and `queryClient` props. It also rejects other prop names when their values resolve to route clients or query hooks. It allows the imported tRPC providers and `QueryClientProvider` setup.
- `no-silent-test-prerequisite` rejects `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`. It also rejects bare test prerequisite returns in test callbacks.
- `no-test-local-object-type` rejects direct object-literal type aliases and interfaces in test files. It allows function aliases, imported types, and schema-derived types.
- `prefetch-route-data-without-waiting` rejects awaited or returned route query calls. It allows an awaited query result in a plain `const` binding when a later tracked query reads that binding in its arguments. Both queries must use the route context query client in the same loader. It also rejects tracked query calls discarded with `void` without a `.catch` handler. It tracks the loader context through local `const` aliases and destructuring.
- `require-backend-request-signal` requires an options object literal on backend method calls in non-test server modules. An explicit `signal` must follow all spreads and dynamic keys so they cannot replace it.
- `require-colocated-test` requires each source test outside `src/tests/` to sit beside a source module whose stem is a prefix of the test stem. It uses the longest matching stem. When stems tie, it prefers a module that matches the test's server suffix, then file-name order. It maps `-root.test.tsx` to `__root.tsx`. A test of a `.server` module must end with `.server.test.ts` so Vitest uses Node.
- `require-ky-json-schema` rejects zero-argument `.json()` calls chained on tracked backend requests and direct Ky requests. It requires `.json(schema)` so Ky validates the response.
- `require-module-file-name` requires the six module suffixes under `src/`: `.mod.ts`, `.mod.tsx`, `.mod.server.ts`, `.mod.test.ts`, `.mod.test.tsx`, and `.mod.server.test.ts`. It rejects a non-test `.mod.tsx` file without JSX. It also checks shared test helpers.
- `require-relative-backend-path` requires a string literal or template literal with a leading single `/` on backend method calls in non-test server modules. It rejects identifiers, absolute URLs, and prefixes that start with `//` or `/\`.
- `require-strict-msw-server` requires `listen({ onUnhandledFrame: "error" })`, `resetHandlers()` in `afterEach`, and `close()` in `afterAll` for an MSW server. MSW 3 uses `onUnhandledFrame`, not `onUnhandledRequest`. It resolves renamed and namespace imports and local server aliases.
- `separate-type-imports` rejects inline `type` specifiers and requires separate `import type` declarations. It reports once per declaration, including declarations with only inline type specifiers. Standalone named, default, and namespace type imports remain allowed.
- `use-effect-in-custom-hook` requires direct React `useEffect` calls inside the nearest named custom hook. It rejects runtime extraction of the Effect reference. Renamed imports, static React members, and immutable namespace aliases retain their React binding. Nested callbacks need their own valid owner. Type-only uses remain allowed.
- `use-shared-render-helper` rejects named runtime `render` imports from `@testing-library/react` and `@testing-library/react/pure` in tests. It also rejects direct `render` calls on imported namespaces from those packages. Use the shared `renderComponent` helper instead.

## File-name exemptions

- `src/routes/**` keeps TanStack file-route names, including ignored route tests.
- `src/router.tsx` and `src/start.ts` keep TanStack's entry-point names.
- `src/routeTree.gen.ts` keeps the generated route-tree name.
- `src/tests/setup-test-environment.ts` keeps the exact setup path in `vitest.config.ts`. Other setup files and `src/tests/utils/**` still need module names.
- The colocated-test rule leaves `src/tests/**` for test setup and shared helpers. It does not check files outside `src/`.

## Core Query import restrictions

The core `no-restricted-imports` entries reject runtime `useQuery`, `useQueries`, and `useInfiniteQuery` imports and source re-exports from `@tanstack/react-query`. Use `useSuspenseQuery`, `useSuspenseQueries`, and `useSuspenseInfiniteQuery`, respectively. The entries also reject runtime namespace imports and wildcard exports from that package. Type-only imports and exports remain allowed. The ESLint `no-restricted-syntax` entry rejects dynamic imports with that literal source. ESLint applies the full base and scoped import restrictions after the Oxlint bridge. This keeps the policy active when the native Oxlint configuration covers only some imports.

Do not import `useQuery`:

```ts
import { useQuery } from "@tanstack/react-query";
```

Import `useSuspenseQuery` instead:

```ts
import { useSuspenseQuery } from "@tanstack/react-query";
```

These restrictions do not check parent `Suspense` or error boundaries. They do not decide whether route data is required. They do not decide loader use, server or client execution, streaming, or retry behavior.

## Known limitations

- ESLint's cache can keep a stale result for `require-colocated-test` after sibling files change. The uncached Oxlint pass in `pnpm lint` runs the same check on every run.
- The colocated-test rule matches file names, not imports or test behavior. If no sibling matches, it searches the source tree to suggest a move. When no module matches anywhere, it gives a naming example instead of inventing a target path.
- The file-name rule detects JSX syntax, not whether a file renders a component. It does not prove server-only execution.

- The prefetch rule checks inline loaders in inline route options. It does not follow stored promises. It does not prove that a `.catch` callback handles every failure.
- Only the operator can mark route data as required. The prefetch rule allows an awaited query when the `await` directly initializes a plain `const` binding. A later tracked query in the same loader must read that binding in its arguments. The rule still checks the later query for waits and missing error handlers. It does not follow result aliases or prove that the later query needs the result.
- The client-prop rule follows static members and local `const` aliases. It does not inspect prop spreads, mutable assignments, custom hooks, or cross-file re-exports. Provider exceptions resolve the known import bindings, not component names alone.

- The strict MSW rule checks calls in one file. It accepts direct hook callbacks. It does not prove execution order or whether conditional setup runs.
- The late-body rule follows local `const` aliases from imported Vitest `vi.fn`, `vi.spyOn`, and `vi.mocked`. It checks the first call argument and its `request` property. It does not prove that a first argument is a Fetch `Request`. It does not follow mutable aliases, returned values, or cross-file helpers.
- The object-type rule checks syntax, not schema equivalence. It does not prove that a type needs a schema or that an imported type is schema-derived.

- The discarded-result rule follows direct `neverthrow` imports and known result-producing methods. It does not follow stored results. Results returned from user functions need type information. Assigning a result passes this rule; the rule does not prove that later code handles it.
- The lifecycle-name rule checks a fixed list of timing names at word boundaries. It does not check object methods, wrapped function initializers, or other timing words. It cannot prove that an allowed name describes the external system.

- The HTTP rules follow resolved imports, direct binding reads, object destructuring, and local `const` aliases. They do not follow cross-file data flow.
- The signal rule checks the options syntax, not the signal value or its source. The path rule checks the static prefix, not interpolated values.
- The JSON rule checks immediate chains only. It does not prove that an argument is a Zod schema or inspect a response saved for a later `.json()` call.
- The Effect rule tracks static member names and immutable namespace aliases. It does not prove arbitrary runtime data flow.
- The Effect rule checks the nearest function owner. It cannot prove that external synchronization is necessary or that the hook name describes its purpose.
- The type-import rule does not establish whether module initialization is required.
- The module-state rule checks only `let` and `var`. The HTTP client rule also checks known client factories at module scope, including `const` initializers. It does not follow local factory wrappers.

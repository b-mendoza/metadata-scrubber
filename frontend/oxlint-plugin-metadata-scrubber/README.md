# Metadata Scrubber Oxlint plugin

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Purpose

This plugin encodes the project's coding standards as enforceable Oxlint rules. Agents read the lint output. They use it to correct their code. The plugin does not import neverthrow. Its consumers do not need neverthrow as a peer dependency.

## Checks

[package.json](../package.json) defines the available commands and scripts.

`check-fixtures.ts` uses `fixture.config.json`, not the main Oxlint config. It checks that each positive fixture has no diagnostics from the rule under test. It compares the exact ordered negative messages. It validates the tool output, including `diagnostics` and a positive `number_of_files`. It rejects diagnostic text with leading or trailing whitespace. The fixture check runs separately from the main lint and test checks.

Directory fixtures run from their own root, so their `src/` paths match real source paths. Single-file fixtures still run from the frontend root. The check validates each diagnostic file name and sorts diagnostics by file name. It keeps message order within each file.

## Rules

- `no-classes` requires plain functions and objects instead of class declarations and class expressions. It also rejects classes that extend `Error`.
- `no-discarded-result` rejects expression statements that discard known `neverthrow` results, including `await`, `void`, and result method chains. It resolves named and namespace imports, including renamed imports. It requires assignment and an `isErr()` check at the boundary.
- `no-expect-type-of` requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls, including renamed imports.
- `no-late-request-body-read` rejects request body reads from Vitest mock call records. It follows the first call argument and its `request` property through local `const` aliases and destructuring. Read or clone the body in the MSW handler instead.
- `no-module-scope-http-client` rejects module-scope `ky.create`, `ky.extend`, and calls to imported factories from `#/shared/libs/ky/`. It follows import aliases and local `const` aliases. Test files remain exempt because test setup can own a shared client without serving requests.
- `no-lifecycle-hook-names` rejects function declarations and function-valued variable declarations with mount-timing hook names. A suffix must start with an uppercase letter, digit, or underscore. It rejects `useMountUploader` but allows `useMountedState`, which describes state rather than mount timing.
- `no-mutable-module-state-in-server-code` rejects module-scope `let` and `var` declarations in server modules.
- `no-query-client-props` rejects `trpc` and `queryClient` props. It also rejects other prop names when their values resolve to route clients or query hooks. It allows the imported tRPC providers and `QueryClientProvider` setup.
- `no-silent-test-prerequisite` rejects `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`. It also rejects bare test prerequisite returns in test callbacks.
- `no-test-local-object-type` rejects direct object-literal type aliases and interfaces in test files. It allows function aliases, imported types, and schema-derived types.
- `require-colocated-test` requires each source test outside `src/tests/` to sit beside a source module whose stem is a prefix of the test stem. It uses the longest matching stem, then file-name order. It maps `-root.test.tsx` to `__root.tsx`. A test of a `.server` module must end with `.server.test.ts` so Vitest uses Node.
- `require-module-file-name` requires the six module suffixes under `src/`: `.mod.ts`, `.mod.tsx`, `.mod.server.ts`, `.mod.test.ts`, `.mod.test.tsx`, and `.mod.server.test.ts`. It rejects a non-test `.mod.tsx` file without JSX. It also checks shared test helpers.
- `require-strict-msw-server` requires `listen({ onUnhandledFrame: "error" })`, `resetHandlers()` in `afterEach`, and `close()` in `afterAll` for an MSW server. MSW 3 uses `onUnhandledFrame`, not `onUnhandledRequest`. It resolves renamed and namespace imports and local server aliases.
- `separate-type-imports` rejects inline `type` specifiers and requires separate `import type` declarations. It reports once per declaration, including declarations with only inline type specifiers. Standalone named, default, and namespace type imports remain allowed.
- `use-effect-in-custom-hook` requires direct React `useEffect` calls inside the nearest named custom hook. It rejects runtime extraction of the Effect reference. Renamed imports, static React members, and immutable namespace aliases retain their React binding. Nested callbacks need their own valid owner. Type-only uses remain allowed.
- `use-shared-render-helper` requires the shared `renderComponent` helper for Testing Library rendering.

## File-name exemptions

- `src/routes/**` keeps TanStack file-route names, including ignored route tests.
- `src/router.tsx` and `src/start.ts` keep TanStack's entry-point names.
- `src/routeTree.gen.ts` keeps the generated route-tree name.
- `src/tests/setup-test-environment.ts` keeps the exact setup path in `vitest.config.ts`. Other setup files and `src/tests/utils/**` still need module names.
- The colocated-test rule leaves `src/tests/**` for test setup and shared helpers. It does not check files outside `src/`.

## Core Query import restrictions

The core `no-restricted-imports` entries reject runtime `useQuery` imports and source re-exports from `@tanstack/react-query`. They also reject runtime namespace imports and wildcard exports from that package. Type-only imports and exports remain allowed. The ESLint `no-restricted-syntax` entry rejects dynamic imports with that literal source.

These restrictions do not check actual Suspense or error-boundary ancestry. They do not decide route data criticality, loader use, server or client execution, streaming, or retry behavior.

## General rule design

- Keep diagnostic wording consistent. Define repeated wording in one place when that improves clarity.
- Resolve a reference by its meaning, not only by its spelling.

## Diagnostic messages

The configured CLI output shows one line for each diagnostic. The line contains the path, position, rule ID, and message. It has no separate help channel.

Make each diagnostic clear enough to explain the required correction. Explain the problem. State its cause or effect. Give a clear correction. Use clear and consistent terms. State the required correction directly. Reject a change that leaves the failure in place.

## Known limitations

- Lint caches do not track sibling-file changes. Run lint without its cache after you move, add, or remove a module or test.
- The colocated-test rule matches file names, not imports or test behavior. If no sibling matches, it searches the source tree to suggest a move. When no module matches anywhere, it gives a naming example instead of inventing a target path. Directory read failures produce a diagnostic.
- The file-name rule detects JSX syntax, not whether a file renders a component. It does not prove server-only execution.

- The client-prop rule follows static members and local `const` aliases. It does not inspect prop spreads, mutable assignments, custom hooks, or cross-file re-exports. Provider exceptions resolve the known import bindings, not component names alone.

- The strict MSW rule checks calls in one file. It accepts direct hook callbacks, not named callbacks or cross-file setup. It does not prove execution order or whether conditional setup runs. It does not follow aliases of imported APIs, mutable server aliases, or destructured server methods.
- The late-body rule follows local `const` aliases from imported Vitest `vi.fn`, `vi.spyOn`, and `vi.mocked`. It checks the first call argument and its `request` property. It does not prove that a first argument is a Fetch `Request`. It does not follow mutable aliases, returned values, or cross-file helpers.
- The object-type rule checks syntax, not schema equivalence. It allows function types, nested object types, arrays, unions, intersections, and schema-derived aliases. It does not prove that a type needs a schema or that an imported type is schema-derived.

- The discarded-result rule follows direct `neverthrow` imports and known result-producing methods. It does not follow stored results, local aliases, re-exports, or dynamic member keys. Results returned from user functions need type information. Assigning a result passes this rule; the rule does not prove that later code handles it.
- The lifecycle-name rule checks a fixed list of timing names at word boundaries. It does not check object methods, wrapped function initializers, or other timing words. It cannot prove that an allowed name describes the external system.

- The HTTP rules follow resolved imports, direct binding reads, object destructuring, and local `const` aliases. They do not follow mutable aliases, re-exports, dynamic member names, or cross-file data flow.
- The Effect rule tracks static member names and immutable namespace aliases. It does not evaluate dynamic keys, follow mutable namespace aliases, or prove arbitrary runtime data flow.
- The Effect rule checks the nearest function owner. It cannot prove that external synchronization is necessary or that the hook name describes its purpose.
- The type-import rule does not establish whether module initialization is required.
- The module-state rule checks only `let` and `var`. The HTTP client rule also checks known client factories at module scope, including `const` initializers. It does not follow local factory wrappers or calls made inside immediately invoked functions.
- Namespace Vitest calls such as `vitest.expectTypeOf(...)` and `vitest.test.skip(...)` are not resolved.
- Disabled Vitest calls through `test.todo(...)` and `test.skipIf(true)(...)` are not reported.
- Suggested guard assertions do not preserve TypeScript control-flow narrowing.
- A destructured Testing Library `render` reference is not reported after a namespace import.
- An unresolved non-Vitest global can be reported when it uses the Vitest name `expectTypeOf`, `describe`, `it`, or `test`.
- `unicorn/consistent-function-scoping` does not report inline callbacks.
- `vitest/no-conditional-expect` does not check a helper outside a test callback.

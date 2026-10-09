# Metadata Scrubber Oxlint plugin

> **Factual reference.** This file describes the current state of the code. Update it when the code changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Purpose

This plugin encodes the project's coding standards as enforceable Oxlint rules. Agents read the lint output. They use it to correct their code. The plugin does not import neverthrow. Its consumers do not need neverthrow as a peer dependency.

## Checks

[package.json](../package.json) defines the available commands and scripts.

`check-fixtures.ts` uses `fixture.config.json`, not the main Oxlint config. It checks that each positive fixture has no diagnostics from the rule under test. It compares the exact ordered negative messages. It validates the tool output, including `diagnostics` and a positive `number_of_files`. It rejects diagnostic text with leading or trailing whitespace. The fixture check runs separately from the main lint and test checks.

## Rules

- `no-classes` requires plain functions and objects instead of class declarations and class expressions. It also rejects classes that extend `Error`.
- `no-expect-type-of` requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls, including renamed imports.
- `no-hardcoded-backend-host` requires environment fields instead of static HTTP service hosts outside tests and the validated environment module.
- `no-mutable-module-state-in-server-code` rejects module-scope `let` and `var` declarations in server modules.
- `no-silent-test-prerequisite` rejects `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`. It also rejects bare test prerequisite returns in test callbacks.
- `separate-type-imports` rejects inline `type` specifiers and requires separate `import type` declarations. It reports once per declaration, including declarations with only inline type specifiers. Standalone named, default, and namespace type imports remain allowed.
- `use-effect-in-custom-hook` requires direct React `useEffect` calls inside the nearest named custom hook. It rejects runtime extraction of the Effect reference. Renamed imports, static React members, and immutable namespace aliases retain their React binding. Nested callbacks need their own valid owner. Type-only uses remain allowed.
- `use-shared-render-helper` requires the shared `renderComponent` helper for Testing Library rendering.

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

- The Effect rule tracks static member names and immutable namespace aliases. It does not evaluate dynamic keys, follow mutable namespace aliases, or prove arbitrary runtime data flow.
- The Effect rule checks the nearest function owner. It cannot prove that external synchronization is necessary or that the hook name describes its purpose.
- The type-import rule does not establish whether module initialization is required.
- The module-state rule checks only `let` and `var`. A module-level `const` client can still share state between requests.
- Namespace Vitest calls such as `vitest.expectTypeOf(...)` and `vitest.test.skip(...)` are not resolved.
- Disabled Vitest calls through `test.todo(...)` and `test.skipIf(true)(...)` are not reported.
- Suggested guard assertions do not preserve TypeScript control-flow narrowing.
- A destructured Testing Library `render` reference is not reported after a namespace import.
- An unresolved non-Vitest global can be reported when it uses the Vitest name `expectTypeOf`, `describe`, `it`, or `test`.
- Protocol-relative string literals such as `"//backend.example.com/api"` are not reported.
- `unicorn/consistent-function-scoping` does not report inline callbacks.
- `vitest/no-conditional-expect` does not check a helper outside a test callback.

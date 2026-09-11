# Metadata Scrubber Oxlint Plugin

> **Short-lived reference.** This file describes the current state of the code. Update this file whenever that state changes. Use the code as the source of truth when this file and the code disagree. Fix this file.

## Purpose

This plugin encodes the project's coding standards as enforceable Oxlint rules. Agents read the lint output. They use it to correct their code. The messages must therefore carry all repair instructions.

## Registration and commands

`index.ts` registers nine `metadata-scrubber/...` rules. `fixture.config.json` enables all nine at error severity. `frontend/eslint.config.js` also loads this plugin and enables all nine at error severity.

## Rules

- `no-classes` requires plain functions and objects instead of class declarations and class expressions. It also rejects classes that extend `Error`.
- `no-expect-type-of` requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls, including renamed imports.
- `no-hardcoded-backend-host` requires environment fields instead of static HTTP service hosts outside tests and the validated environment module.
- `no-mutable-module-state-in-server-code` rejects module-scope `let` and `var` declarations in server modules.
- `no-silent-test-prerequisite` rejects `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`. It also rejects bare test prerequisite returns in test callbacks.
- `use-shared-render-helper` requires the shared `renderComponent` helper for Testing Library rendering.

- `use-effect-in-custom-hook` requires direct React `useEffect` calls inside the nearest named custom hook. It rejects runtime extraction of the Effect reference. Renamed imports, static React members, and immutable namespace aliases retain their React binding. Nested callbacks need their own valid owner. Type-only uses remain allowed.
- `no-use-query` rejects runtime `useQuery` imports, source re-exports, static namespace members, and destructuring from `@tanstack/react-query`. It also rejects runtime wildcard exports from that package. Use `useSuspenseQuery` with an ancestor Suspense boundary and suitable error handling. Type-only uses and other Query APIs remain allowed.

- `separate-type-imports` rejects inline `type` specifiers in import declarations. It reports once per declaration, including declarations with only inline type specifiers. Use a separate `import type` declaration. Keep runtime imports separate. Preserve aliases and required module side effects. Standalone named, default, and namespace type imports remain allowed. A runtime binding named `type` remains allowed.

## How to contribute a rule

1. Add a rule file under `rules/` and create the rule with `defineRule`.
2. Export the rule from `index.ts`.
3. Register the rule in `fixture.config.json`.
4. Define message templates in `meta.messages`.
5. Report with `messageId` and `{{ interpolation }}` data.
6. Do not put an inline message string in `context.report`.
7. Resolve identifiers through the scope API.
8. Do not match an identifier by its name only.
9. Add a positive fixture that produces zero diagnostics.
10. Add a negative fixture that produces the required diagnostics.
11. Pin the exact diagnostic count in `check-fixtures.ts`. Pin each exact rendered message in the same file.
12. Run the fixture before the rule change and record the expected failure.
13. Implement the smallest rule change that makes the fixture pass.
14. Do not add lint-suppression comments.

## Message standard

The CLI shows exactly one line for each diagnostic. The line contains the path and position, the rule ID, and the message. The CLI has no separate help channel. The message must contain all repair instructions.

Use this three-part structure:

1. Identify the exact problem with the interpolated identifier or source reference.
2. Give the reason that the code causes a problem.
3. State the required fix with the exact import path or API when one applies.

Each message must identify the problem, give the reason, and state the required fix. Name each known bypass. Forbid the bypass when it can preserve the violation. Use technical terms consistently. Do not use `Please`. Do not use vague words such as `similar` or `appropriate`.

## Known limitations

- The Query rule does not check actual Suspense or error-boundary ancestry. It does not decide route data criticality, loader use, server or client execution, streaming, or retry behavior. Review these properties in the application. A boundary can live in another file. Not every component needs a loader.
- The type-import rule does not decide whether a module needs a side-effect import. Review module initialization before removing the last runtime import.
- The Effect rule checks the nearest function owner. It cannot prove that external synchronization is necessary or that the hook name describes its purpose. A name such as `useMount` passes the name pattern but still needs review.
- Namespace Vitest calls such as `vitest.expectTypeOf(...)` and `vitest.test.skip(...)` are not resolved.
- Disabled Vitest calls through `test.todo(...)` and `test.skipIf(true)(...)` are not reported.
- Suggested guard assertions do not preserve TypeScript control-flow narrowing. Adapt the surrounding code when it depends on that narrowing.
- A destructured Testing Library `render` reference is not reported after a namespace import.
- An unresolved non-Vitest global can be reported when it uses the Vitest name `expectTypeOf`, `describe`, `it`, or `test`.
- Protocol-relative string literals such as `"//backend.example.com/api"` are not reported.

# Metadata Scrubber Oxlint Plugin

> **Short-lived reference.** This file describes the current state of the code and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Purpose

This plugin encodes the project's coding standards as enforceable Oxlint rules. Agents read the lint output and use it to correct their code. The messages must therefore carry all repair instructions.

## Registration and commands

`.oxlintrc.json` loads `./oxlint-plugin-metadata-scrubber/index.ts` and enables all eight `metadata-scrubber/...` rules. `eslint.config.js` registers the same plugin as `metadata-scrubber`. Run `pnpm run lint` from `frontend/` to run the project lint pipeline. Run `node oxlint-plugin-metadata-scrubber/check-fixtures.ts` from `frontend/` to run the fixture harness. The fixture harness is a manual check. It is not part of the `pnpm run lint` pipeline.

## Rules

- `hoist-effect-schema-compilers` — Requires supported Effect Schema compilers at module scope in server modules.
- `no-classes` — Requires factory functions instead of application classes, except for the allowed Effect `Data` and `Schema` class constructors.
- `no-expect-type-of` — Requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls.
- `no-hardcoded-backend-host` — Requires environment fields instead of static HTTP service hosts outside tests and the validated environment module.
- `no-mutable-module-state-in-server-code` — Forbids module-scope `let` and `var` declarations in server modules.
- `no-silent-test-prerequisite` — Forbids `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`, and bare test prerequisite returns in test callbacks.
- `schema-import-boundaries` — Forbids runtime imports from the `effect` package in browser modules, runtime imports from the `zod` package in server modules, and runtime imports from both packages in shared modules.
- `use-shared-render-helper` — Requires the shared `renderComponent` helper for Testing Library rendering.

## How to contribute a rule

1. Add a rule file under `rules/` and create the rule with `defineRule`.
2. Export the rule from `index.ts`.
3. Register the rule in `.oxlintrc.json` and `eslint.config.js`.
4. Register the rule in `fixture.config.json`.
5. Define message templates in `meta.messages`.
6. Report with `messageId` and `{{ interpolation }}` data.
7. Do not put an inline message string in `context.report`.
8. Resolve identifiers through the scope API.
9. Do not match an identifier by its name only.
10. Add a positive fixture that produces zero diagnostics.
11. Add a negative fixture that produces the required diagnostics.
12. Pin the exact diagnostic count and each exact rendered message in `check-fixtures.ts`.
13. Run the fixture before the rule change and record the expected failure.
14. Implement the smallest rule change that makes the fixture pass.
15. Do not add lint-suppression comments.

## Message standard

The CLI shows exactly one line for each diagnostic. The line contains the path and position, the rule ID, and the message. The CLI has no separate help channel. The message must contain all repair instructions.

Use this three-part structure:

1. Name the exact violation with the interpolated identifier or source reference.
2. Give the exact idiomatic replacement with the real import path or API.
3. State the invariant so an agent can apply the rule to new code.

Name the known bypass and forbid it when the bypass can preserve the violation. Use these terms consistently: the `effect` package, the `zod` package, the Effect Schema API, the Zod API, runtime import, type-only import, module scope, request scope, browser module, server module, shared module, test prerequisite, and factory function. Do not use `Please`. Do not use vague words such as `similar` or `appropriate`.

## Known limitations

- Namespace Vitest calls such as `vitest.expectTypeOf(...)` and `vitest.test.skip(...)` are not resolved.
- Disabled Vitest calls through `test.todo(...)` and `test.skipIf(true)(...)` are not reported.
- A destructured Testing Library `render` reference is not reported after a namespace import.
- An unresolved non-Vitest global can be reported when it uses the Vitest name `expectTypeOf`, `describe`, `it`, or `test`.

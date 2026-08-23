# Metadata Scrubber Oxlint Plugin

> **Short-lived reference.** This file describes the current state of the code. Update this file whenever that state changes. Use the code as the source of truth when this file and the code disagree. Fix this file.

## Purpose

This plugin encodes the project's coding standards as enforceable Oxlint rules. Agents read the lint output. They use it to correct their code. The messages must therefore carry all repair instructions.

## Registration and commands

`.oxlintrc.json` loads `./oxlint-plugin-metadata-scrubber/index.ts`. It enables all eight `metadata-scrubber/...` rules. `eslint.config.js` registers the same plugin as `metadata-scrubber`. Run `pnpm run lint` from `frontend/` to run the project lint pipeline. Run `node oxlint-plugin-metadata-scrubber/check-fixtures.ts` from `frontend/` to run the fixture harness. The fixture harness is a manual check. It is not part of the `pnpm run lint` pipeline.

## Rules

- `no-classes` — Requires plain functions and objects instead of application classes, except for the allowed Effect `Data` class constructors.
- `no-expect-type-of` — Requires TypeScript contracts instead of Vitest `expectTypeOf(...)` calls.
- `no-hardcoded-backend-host` — Requires environment fields instead of static HTTP service hosts outside tests and the validated environment module.
- `no-mutable-module-state-in-server-code` — Forbids module-scope `let` and `var` declarations in server modules.
- `no-silent-test-prerequisite` — Forbids `.skip` calls on Vitest test APIs, including chains such as `test.skip.each(...)`, and bare test prerequisite returns in test callbacks.
- `use-shared-render-helper` — Requires the shared `renderComponent` helper for Testing Library rendering.

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

- Namespace Vitest calls such as `vitest.expectTypeOf(...)` and `vitest.test.skip(...)` are not resolved.
- Disabled Vitest calls through `test.todo(...)` and `test.skipIf(true)(...)` are not reported.
- Suggested guard assertions do not preserve TypeScript control-flow narrowing. Adapt the surrounding code when it depends on that narrowing.
- A destructured Testing Library `render` reference is not reported after a namespace import.
- An unresolved non-Vitest global can be reported when it uses the Vitest name `expectTypeOf`, `describe`, `it`, or `test`.
- Protocol-relative string literals such as `"//backend.example.com/api"` are not reported.

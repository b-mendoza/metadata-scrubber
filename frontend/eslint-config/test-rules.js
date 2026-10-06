import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import testingLibrary from "eslint-plugin-testing-library";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const testRules = defineConfig(
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    ...testingLibrary.configs["flat/react"],
    rules: {
      ...testingLibrary.configs["flat/react"].rules,
      // User-event sessions model real interactions and retain device state.
      [`${PLUGIN_NAMES.TestingLibrary}/prefer-user-event`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.TestingLibrary}/prefer-user-event-setup`]:
        SEVERITY_LEVELS.Error,
      // The type-aware await rule already checks the real return type.
      [`${PLUGIN_NAMES.TestingLibrary}/no-await-sync-queries`]:
        SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.TestingLibrary}/no-await-sync-events`]:
        SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.TestingLibrary}/no-debugging-utils`]:
        SEVERITY_LEVELS.Error,
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,

      // Explicit registration keeps test coverage independent of runtime branches.
      [`${PLUGIN_NAMES.Vitest}/no-conditional-tests`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-each`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/warn-todo`]: SEVERITY_LEVELS.Error,
      // Isolated setup and restorable mocks prevent test order dependencies.
      [`${PLUGIN_NAMES.Vitest}/hoisted-apis-on-top`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-mock-promise-shorthand`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-spy-on`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/require-hook`]: SEVERITY_LEVELS.Error,
      // Specific matchers make failed assertions explain the wrong behavior.
      [`${PLUGIN_NAMES.Vitest}/prefer-expect-type-of`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-have-been-called-times`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/require-to-throw-message`]:
        SEVERITY_LEVELS.Error,

      // Upstream turned this off because a testing-library query throws when
      // it matches nothing, so a test with no literal `expect` can still
      // assert something.
      [`${PLUGIN_NAMES.Vitest}/expect-expect`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.Vitest}/no-disabled-tests`]: SEVERITY_LEVELS.Error,

      // Error, and no autofix: we want a leftover `.only` visible in review,
      // and a fix would delete it while someone debugs.
      [`${PLUGIN_NAMES.Vitest}/no-focused-tests`]: [
        SEVERITY_LEVELS.Error,
        {
          fixable: false,
        },
      ],

      // Use the matcher that names the assertion, so the failure message says
      // which comparison broke.
      [`${PLUGIN_NAMES.Vitest}/prefer-comparison-matcher`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-equality-matcher`]: SEVERITY_LEVELS.Error,

      // Our addition: pass `import()` as the first `vi.mock` argument so TypeScript checks the module path and the factory type.
      [`${PLUGIN_NAMES.Vitest}/prefer-import-in-mock`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-be`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-contain`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-have-length`]: SEVERITY_LEVELS.Error,

      // These rules conflict with query-only assertions and the test skip ban.
      [`${PLUGIN_NAMES.SonarJS}/assertions-in-tests`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/explicit-test-skip`]: SEVERITY_LEVELS.Off,

      // The enabled Vitest rules already check these test errors.
      [`${PLUGIN_NAMES.SonarJS}/no-exclusive-tests`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/no-skipped-tests`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/no-duplicate-test-title`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/no-empty-test-title`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/no-incomplete-assertions`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/assertions-in-test-cases`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/async-test-assertions`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.SonarJS}/prefer-specific-assertions`]:
        SEVERITY_LEVELS.Off,
    },
  },
);

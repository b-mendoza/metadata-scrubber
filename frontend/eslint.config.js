import e18e from "@e18e/eslint-plugin";
import eslint from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import love from "eslint-config-love";
import jsxA11y from "eslint-plugin-jsx-a11y";
import oxlint from "eslint-plugin-oxlint";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import testingLibrary from "eslint-plugin-testing-library";
import unicorn from "eslint-plugin-unicorn";
import eslintPluginZod from "eslint-plugin-zod";
import globals from "globals";
import tseslint from "typescript-eslint";

const ERROR = 2;
const OFF = 0;

const MAX_COMPLEXITY = 8;

const BASE_RESTRICTED_IMPORT_PATTERNS = [
  {
    regex: "^zod\\/.+$",
    message:
      'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
  },
];

const BASE_RESTRICTED_SYNTAX = [
  {
    selector: "SwitchStatement",
    message: "Use a lookup map that raises an error for unknown keys instead.",
  },
];

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintReact.configs["strict-type-checked"],
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.strict.rules,
      "jsx-a11y/anchor-has-content": [
        ERROR,
        {
          components: ["Link", "NavLink"],
        },
      ],
    },
  },
  // @ts-expect-error Type incompatibility between @typescript-eslint/utils re-exported types and defineConfig.
  // This is a known issue with plugins using TSESLint.FlatConfig types.
  // See: https://github.com/typescript-eslint/typescript-eslint/issues/11543
  love,
  unicorn.configs.recommended,
  e18e.configs.recommended,
  sonarjs.configs?.["recommended"],
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": ERROR,
      "simple-import-sort/exports": ERROR,
    },
  },
  eslintPluginZod.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * These rules are disabled because they duplicate enabled unicorn or
       * typescript-eslint rules. `e18e/prefer-string-fromcharcode` and
       * `e18e/prefer-array-fill` conflict with `unicorn/prefer-code-point` and
       * `unicorn/no-array-from-fill`. `sonarjs/prefer-regexp-exec` conflicts with
       * the enabled `.test()` rules.
       */
      // =======================================================================
      "e18e/prefer-array-at": OFF,
      "e18e/prefer-array-fill": OFF,
      "e18e/prefer-array-some": OFF,
      "e18e/prefer-array-to-reversed": OFF,
      "e18e/prefer-array-to-sorted": OFF,
      "e18e/prefer-date-now": OFF,
      "e18e/prefer-includes": OFF,
      "e18e/prefer-nullish-coalescing": OFF,
      "e18e/prefer-object-has-own": OFF,
      "e18e/prefer-spread-syntax": OFF,
      "e18e/prefer-string-fromcharcode": OFF,
      "sonarjs/prefer-regexp-exec": OFF,
      // =======================================================================

      "unicorn/prevent-abbreviations": [
        ERROR,
        {
          allowList: {
            mod: true,
            props: true,
            Props: true,
          },
        },
      ],
      "@eslint-community/eslint-comments/disable-enable-pair": ERROR,
      "@typescript-eslint/consistent-type-imports": [
        ERROR,
        {
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": OFF,
      "@typescript-eslint/no-deprecated": ERROR,
      "@typescript-eslint/no-magic-numbers": [
        ERROR,
        {
          ignoreTypeIndexes: true,
        },
      ],
      "@typescript-eslint/no-misused-promises": [
        ERROR,
        {
          checksVoidReturn: false,
        },
      ],
      "@typescript-eslint/only-throw-error": [
        ERROR,
        {
          allow: [
            {
              from: "package",
              name: "NotFoundError",
              package: "@tanstack/router-core",
            },
          ],
        },
      ],
      "@typescript-eslint/prefer-destructuring": [
        ERROR,
        {
          array: false,
          object: true,
        },
        {
          /**
           * We disable this for renamed properties, since code like the following should be valid:
           *
           * ```ts
           * const someSpecificMyEnum = MyEnum.Value1;
           * ```
           */
          enforceForRenamedProperties: false,
        },
      ],
      "@typescript-eslint/return-await": [ERROR, "in-try-catch"],
      "arrow-body-style": OFF,
      "import/newline-after-import": ERROR,
      "no-restricted-imports": [
        ERROR,
        {
          patterns: BASE_RESTRICTED_IMPORT_PATTERNS,
        },
      ],
      "no-restricted-syntax": [ERROR, ...BASE_RESTRICTED_SYNTAX],
      // Prefer null over undefined as the explicit empty value.
      "no-undefined": ERROR,
      "object-shorthand": ERROR,
      "react-hooks/exhaustive-deps": ERROR,
      /**
       * Disabled because the `v` flag requires es2024, but our project targets es2023.
       * Re-enable when the project upgrades to es2024.
       * @see https://eslint.org/docs/latest/rules/require-unicode-regexp
       */
      "require-unicode-regexp": OFF,
      "sonarjs/cognitive-complexity": [ERROR, MAX_COMPLEXITY],
      "sonarjs/no-commented-code": ERROR,
      "sonarjs/todo-tag": ERROR,
      "unicorn/no-null": OFF,
      complexity: [
        ERROR,
        {
          variant: "modified",
          max: MAX_COMPLEXITY,
        },
      ],
      eqeqeq: [
        ERROR,
        "always",
        {
          null: "ignore",
        },
      ],
    },
  },
  /**
   * These two blocks mirror the `tsconfig.app.json` / `tsconfig.node.json`
   * split.
   *
   * A file under `src` can hold browser code and server code at once, so it
   * needs `browser` plus `node`. `shared-node-browser` holds only the globals
   * common to both, so it defines neither `window` nor `process`.
   */
  {
    files: ["src/**/*.ts?(x)", "lucide.d.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: [
      "drizzle.config.ts",
      "eslint.config.js",
      "oxlint-plugin-metadata-scrubber/**/*.ts",
      "scripts/**/*.ts",
      "vite.config.ts",
      "vitest.config.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/**/*.test.ts?(x)"],
    ...testingLibrary.configs["flat/react"],
  },
  {
    files: ["src/**/*.test.ts?(x)"],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,

      // Additive on top of the `recommended` rules spread above. We omit any
      // rule that `recommended` already sets to the same severity.
      //
      // We copied this list from `@epicweb-dev/config`, whose vitest block
      // replaced `recommended` instead of extending it. That package dropped
      // ESLint support, so the list is ours now.

      // Upstream turned this off because a testing-library query throws when
      // it matches nothing, so a test with no literal `expect` can still
      // assert something.
      "vitest/expect-expect": OFF,

      // Error, and no autofix: we want a leftover `.only` visible in review,
      // and a fix would delete it while someone debugs.
      "vitest/no-focused-tests": [
        ERROR,
        {
          fixable: false,
        },
      ],
      "vitest/no-disabled-tests": ERROR,
      "testing-library/no-debugging-utils": ERROR,

      // Use the matcher that names the assertion, so the failure message says
      // which comparison broke.
      "vitest/prefer-comparison-matcher": ERROR,
      "vitest/prefer-equality-matcher": ERROR,
      "vitest/prefer-to-be": ERROR,
      "vitest/prefer-to-contain": ERROR,
      "vitest/prefer-to-have-length": ERROR,

      // Our addition: a `vi.mock` factory must import the module it replaces,
      // since Vitest hoists the factory above outer bindings.
      "vitest/prefer-import-in-mock": ERROR,
    },
  },
  {
    files: ["oxlint-plugin-metadata-scrubber/check-fixtures.ts"],
    rules: {
      // This file is a CLI harness. Console output is its user interface.
      "no-console": OFF,
    },
  },
  oxlint.buildFromOxlintConfigFile("./.oxlintrc.json", {
    typeAware: true,
  }),
  globalIgnores([
    ".output/",
    "coverage/",
    "oxlint-plugin-metadata-scrubber/fixtures/",
    "src/routeTree.gen.ts",
  ]),
);

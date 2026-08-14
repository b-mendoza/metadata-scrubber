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
import eslintPluginZod from "eslint-plugin-zod";
import globals from "globals";
import tseslint from "typescript-eslint";

import metadataScrubber from "./oxlint-plugin-metadata-scrubber/index.ts";

const OFF = 0;
const ERROR = 2;
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
  // @ts-expect-error Type incompatibility between @typescript-eslint/utils re-exported types and defineConfig.
  // This is a known issue with plugins using TSESLint.FlatConfig types.
  // See: https://github.com/typescript-eslint/typescript-eslint/issues/11543
  love,
  eslintReact.configs["strict-type-checked"],
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: {
      "metadata-scrubber": metadataScrubber,
    },
    rules: {
      "metadata-scrubber/hoist-effect-schema-compilers": ERROR,
      "metadata-scrubber/no-classes": ERROR,
      "metadata-scrubber/no-expect-type-of": ERROR,
      "metadata-scrubber/no-hardcoded-backend-host": ERROR,
      "metadata-scrubber/no-mutable-module-state-in-server-code": ERROR,
      "metadata-scrubber/no-silent-test-prerequisite": ERROR,
      "metadata-scrubber/schema-import-boundaries": ERROR,
      "metadata-scrubber/use-shared-render-helper": ERROR,
    },
  },
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
      "@eslint-community/eslint-comments/disable-enable-pair": ERROR,
      "@typescript-eslint/consistent-type-imports": [
        ERROR,
        {
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": OFF,
      "@typescript-eslint/naming-convention": [
        ERROR,
        {
          selector: "variableLike",
          format: null,
          filter: {
            regex: "^(?:data|val|tmp|res)$",
            match: true,
          },
          custom: {
            regex: "^(?:data|val|tmp|res)$",
            match: false,
          },
        },
      ],
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
      "@typescript-eslint/no-namespace": [
        ERROR,
        {
          allowDeclarations: true,
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
      "object-shorthand": ERROR,
      "no-restricted-imports": [
        ERROR,
        {
          patterns: BASE_RESTRICTED_IMPORT_PATTERNS,
        },
      ],
      "no-restricted-syntax": [ERROR, ...BASE_RESTRICTED_SYNTAX],
      /**
       * Disabled because the `v` flag requires es2024, but our project targets es2023.
       * Re-enable when the project upgrades to es2024.
       * @see https://eslint.org/docs/latest/rules/require-unicode-regexp
       */
      "require-unicode-regexp": OFF,
      "sonarjs/cognitive-complexity": [ERROR, MAX_COMPLEXITY],
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

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

const OFF = 0;
const WARN = 1;
const ERROR = 2;

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
      globals: {
        ...globals.worker,
      },
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
      eqeqeq: [
        ERROR,
        "always",
        {
          null: "ignore",
        },
      ],
      "import/newline-after-import": ERROR,
      "no-restricted-imports": [
        ERROR,
        {
          patterns: [
            {
              regex: "^zod\\/.+$",
              message: 'Please use "zod" instead.',
            },
          ],
        },
      ],
      /**
       * Disabled because the `v` flag requires es2024, but our project targets es2023.
       * Re-enable when the project upgrades to es2024.
       * @see https://eslint.org/docs/latest/rules/require-unicode-regexp
       */
      "require-unicode-regexp": OFF,
      "sonarjs/no-commented-code": WARN,
      "sonarjs/todo-tag": WARN,
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

      // Custom Vitest ESLint rule overrides inspired by Epic Web's configuration
      //
      // These rules override and add to the spread recommended rules above to enforce
      // best practices like preferring specific matchers and warning about focused tests
      //
      // Source: https://github.com/epicweb-dev/config/blob/main/eslint.js
      "vitest/no-focused-tests": [
        WARN,
        {
          fixable: false,
        },
      ],
      "vitest/no-import-node-test": ERROR,
      "vitest/prefer-comparison-matcher": ERROR,
      "vitest/prefer-equality-matcher": ERROR,
      "vitest/prefer-import-in-mock": ERROR,
      "vitest/prefer-to-be": ERROR,
      "vitest/prefer-to-contain": ERROR,
      "vitest/prefer-to-have-length": ERROR,
      "vitest/valid-expect-in-promise": ERROR,
      "vitest/valid-expect": ERROR,
    },
  },
  globalIgnores([".output/", "coverage/", "src/routeTree.gen.ts"]),
  oxlint.buildFromOxlintConfigFile("./.oxlintrc.json", {
    typeAware: true,
  }),
);

/**
 * eslint.config.js is the single source of truth for lint policy.
 * Never edit .oxlintrc.json.
 * The user updates .oxlintrc.json after each rule change in this file.
 * A new rule stays undefined in oxlint until the user updates that file.
 */
import e18e from "@e18e/eslint-plugin";
import eslint from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import pluginStart from "@tanstack/eslint-plugin-start";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import love from "eslint-config-love";
import { importX } from "eslint-plugin-import-x";
import jsxA11yX from "eslint-plugin-jsx-a11y-x";
import oxlint from "eslint-plugin-oxlint";
import reactHooks from "eslint-plugin-react-hooks";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import testingLibrary from "eslint-plugin-testing-library";
import unicorn from "eslint-plugin-unicorn";
import eslintPluginZod from "eslint-plugin-zod";
import globals from "globals";
import tseslint from "typescript-eslint";

import metadataScrubber from "./oxlint-plugin-metadata-scrubber/index.ts";

const PLUGIN_NAMES = {
  SimpleImportSort: "simple-import-sort",
  ImportX: "import-x",
  MetadataScrubber: "metadata-scrubber",
  JSXA11yX: "jsx-a11y-x",
  E18e: "e18e",
  SonarJS: "sonarjs",
  ESLintCommunityComments: "@eslint-community/eslint-comments",
  TypescriptESLint: "@typescript-eslint",
  Unicorn: "unicorn",
  Vitest: "vitest",
  TestingLibrary: "testing-library",
};

const ERROR = 2;
const OFF = 0;

const SEVERITY_LEVELS = Object.freeze({
  Error: 2,
  Off: 0,
});

const BASE_RESTRICTED_IMPORT_PATTERNS = [
  /**
   * The zod package root is the only supported entry point.
   * In .oxlintrc.json, the user replaces this regex with a zod/** group by
   * hand. That manual change keeps the same policy.
   */
  {
    regex: "^zod\\/.+$",
    message:
      'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
  },
];

// The project replaces each switch statement with a lookup map.
// The lookup map raises an error for each unknown key.
const BASE_RESTRICTED_SYNTAX = [
  {
    selector: "SwitchStatement",
    message: "Use a lookup map that raises an error for unknown keys instead.",
  },
];

// MAX_COMPLEXITY caps cyclomatic complexity per function.
const MAX_COMPLEXITY = 8;

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      [PLUGIN_NAMES.SimpleImportSort]: simpleImportSort,
    },
    rules: {
      [`${PLUGIN_NAMES.SimpleImportSort}/imports`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SimpleImportSort}/exports`]: SEVERITY_LEVELS.Error,
    },
  },
  // @ts-expect-error Type incompatibility between @typescript-eslint/utils re-exported types and defineConfig.
  // This is a known issue with plugins using TSESLint.FlatConfig types.
  // See: https://github.com/typescript-eslint/typescript-eslint/issues/11543
  love,
  // ===========================================================================
  // This block replaces rules removed in Love v155.
  // Reconsider it only when published Love provides equivalent rules,
  // supported peers, and the same rule ownership.
  // ===========================================================================
  {
    plugins: {
      [PLUGIN_NAMES.ImportX]: importX,
    },
    rules: {
      [`${PLUGIN_NAMES.ImportX}/export`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/first`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/no-absolute-path`]: [
        SEVERITY_LEVELS.Error,
        {
          amd: false,
          commonjs: true,
          esmodule: true,
        },
      ],
      [`${PLUGIN_NAMES.ImportX}/no-duplicates`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/no-named-default`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/no-webpack-loader-syntax`]: ERROR,
    },
  },
  // ===========================================================================
  unicorn.configs.recommended,
  e18e.configs.recommended,
  sonarjs.configs?.["recommended"],
  {
    plugins: {
      [PLUGIN_NAMES.MetadataScrubber]: metadataScrubber,
    },
    rules: {
      [`${PLUGIN_NAMES.MetadataScrubber}/no-classes`]: ERROR,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-expect-type-of`]: ERROR,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-hardcoded-backend-host`]: ERROR,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-mutable-module-state-in-server-code`]:
        ERROR,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-silent-test-prerequisite`]: ERROR,
      [`${PLUGIN_NAMES.MetadataScrubber}/use-shared-render-helper`]: ERROR,
    },
  },
  eslintReact.configs["strict-type-checked"],
  reactHooks.configs.flat["recommended-latest"],
  reactYouMightNotNeedAnEffect.configs.strict,
  {
    plugins: {
      [PLUGIN_NAMES.JSXA11yX]: jsxA11yX,
    },
    rules: {
      ...jsxA11yX.configs.strict.rules,
      [`${PLUGIN_NAMES.JSXA11yX}/anchor-has-content`]: [
        ERROR,
        {
          components: ["Link", "NavLink"],
        },
      ],
    },
  },
  pluginRouter.configs["flat/recommended"],
  pluginStart.configs["flat/recommended"],
  pluginQuery.configs["flat/recommended-strict"],
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
       * A plugin-collision audit found these rule overlaps.
       * Each disabled rule duplicates or conflicts with a rule that another
       * plugin or oxlint already enforces.
       * These rules are disabled because they duplicate enabled unicorn or
       * typescript-eslint rules. `e18e/prefer-string-fromcharcode` and
       * `e18e/prefer-array-fill` conflict with `unicorn/prefer-code-point` and
       * `unicorn/no-array-from-fill`. `sonarjs/prefer-regexp-exec` conflicts with
       * the enabled `.test()` rules.
       */
      // =======================================================================
      [`${PLUGIN_NAMES.E18e}/prefer-array-at`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-array-fill`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-array-some`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-array-to-reversed`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-array-to-sorted`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-date-now`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-includes`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-nullish-coalescing`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-object-has-own`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-spread-syntax`]: OFF,
      [`${PLUGIN_NAMES.E18e}/prefer-string-fromcharcode`]: OFF,
      [`${PLUGIN_NAMES.SonarJS}/prefer-regexp-exec`]: OFF,
      // =======================================================================

      [`${PLUGIN_NAMES.ESLintCommunityComments}/disable-enable-pair`]: ERROR,
      [`${PLUGIN_NAMES.TypescriptESLint}/consistent-type-imports`]: [
        ERROR,
        {
          fixStyle: "separate-type-imports",
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/explicit-function-return-type`]: OFF,
      /**
       * A function accepts at most 3 parameters.
       * The Deno style guide sets this shape: at most 2 required positional
       * parameters, plus a trailing options object when more values exist.
       * To fix a violation, keep the main arguments positional and move the
       * extra values into a trailing options object.
       * Do not collapse every argument into one object parameter. That hides
       * the main arguments and makes each call site harder to read.
       * This rule overrides the eslint-config-love limit of 4.
       */
      [`${PLUGIN_NAMES.TypescriptESLint}/max-params`]: [
        ERROR,
        {
          max: 3,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-deprecated`]: ERROR,
      [`${PLUGIN_NAMES.TypescriptESLint}/no-floating-promises`]: [
        ERROR,
        {
          checkThenables: true,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-magic-numbers`]: [
        ERROR,
        {
          ignoreTypeIndexes: true,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-misused-promises`]: [
        ERROR,
        {
          checksVoidReturn: false,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/only-throw-error`]: [
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
      [`${PLUGIN_NAMES.TypescriptESLint}/prefer-destructuring`]: [
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
      [`${PLUGIN_NAMES.TypescriptESLint}/return-await`]: [
        ERROR,
        "in-try-catch",
      ],
      "arrow-body-style": OFF,
      [`${PLUGIN_NAMES.ImportX}/newline-after-import`]: ERROR,
      "no-restricted-imports": [
        ERROR,
        {
          patterns: BASE_RESTRICTED_IMPORT_PATTERNS,
        },
      ],
      "no-restricted-syntax": [ERROR, ...BASE_RESTRICTED_SYNTAX],
      // The project uses null as the one explicit absent value.
      // Prefer null over undefined as the explicit empty value.
      "no-undefined": ERROR,
      "object-shorthand": ERROR,
      "react-hooks/exhaustive-deps": ERROR,
      [`${PLUGIN_NAMES.SonarJS}/cognitive-complexity`]: [ERROR, MAX_COMPLEXITY],
      [`${PLUGIN_NAMES.SonarJS}/no-commented-code`]: ERROR,
      [`${PLUGIN_NAMES.SonarJS}/todo-tag`]: ERROR,
      // Keep null legal because the project uses it as the one explicit absent value.
      [`${PLUGIN_NAMES.Unicorn}/no-null`]: OFF,
      /**
       * The project uses these established terms.
       * mod comes from the *.mod.ts file-name convention.
       * props and Props come from React.
       * ref also comes from React. The @eslint-react/naming-convention-ref-name
       * rule requires ref or a Ref suffix.
       */
      [`${PLUGIN_NAMES.Unicorn}/name-replacements`]: [
        ERROR,
        {
          replacements: {
            mod: false,
            props: false,
            ref: false,
          },
        },
      ],
      [`${PLUGIN_NAMES.Unicorn}/text-encoding-identifier-case`]: [
        ERROR,
        {
          withDash: true,
        },
      ],
      complexity: [
        ERROR,
        {
          variant: "modified",
          max: MAX_COMPLEXITY,
        },
      ],
      // The project requires loose equality against null.
      // One comparison then covers both null and undefined.
      eqeqeq: [
        ERROR,
        "always",
        {
          null: "never",
        },
      ],
    },
  },
  /**
   * These blocks mirror the `tsconfig.app.json` / `tsconfig.node.json` /
   * `tsconfig.oxlint-plugin.json` split.
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
      "scripts/**/*.ts",
      "vite.config.ts",
      "vitest.config.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["oxlint-plugin-metadata-scrubber/**/*.ts"],
    languageOptions: {
      globals: globals.node,
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
      [`${PLUGIN_NAMES.Vitest}/expect-expect`]: OFF,

      // Error, and no autofix: we want a leftover `.only` visible in review,
      // and a fix would delete it while someone debugs.
      [`${PLUGIN_NAMES.Vitest}/no-focused-tests`]: [
        ERROR,
        {
          fixable: false,
        },
      ],
      [`${PLUGIN_NAMES.Vitest}/no-disabled-tests`]: ERROR,
      [`${PLUGIN_NAMES.TestingLibrary}/no-debugging-utils`]: ERROR,

      // Use the matcher that names the assertion, so the failure message says
      // which comparison broke.
      [`${PLUGIN_NAMES.Vitest}/prefer-comparison-matcher`]: ERROR,
      [`${PLUGIN_NAMES.Vitest}/prefer-equality-matcher`]: ERROR,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-be`]: ERROR,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-contain`]: ERROR,
      [`${PLUGIN_NAMES.Vitest}/prefer-to-have-length`]: ERROR,

      // Our addition: a `vi.mock` factory must import the module it replaces,
      // since Vitest hoists the factory above outer bindings.
      [`${PLUGIN_NAMES.Vitest}/prefer-import-in-mock`]: ERROR,
    },
  },
  {
    files: ["oxlint-plugin-metadata-scrubber/check-fixtures.ts"],
    rules: {
      // This file is a CLI harness. Console output is its user interface.
      "no-console": OFF,
    },
  },
  /**
   * This final oxlint entry turns off the ESLint copy of each rule that
   * oxlint owns.
   * Each rule then runs in exactly one tool.
   */
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

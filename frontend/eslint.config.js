/**
 * eslint.config.js is the single entry point for lint policy.
 * The policy is this file plus these imported modules:
 * eslint-config/constants.js, eslint-config/rule-exceptions.js,
 * and eslint-config/test-rules.js.
 * Never edit .oxlintrc.json.
 * The user updates .oxlintrc.json after each rule change in these files.
 * A new rule stays undefined in oxlint until the user updates that file.
 * Keep these rules in ESLint only:
 * promise/prefer-catch: oxlint skips void promise.then(a, b).
 * unicorn/prefer-string-raw: oxlint skips values with identifier property keys.
 * unicorn/no-array-callback-reference: oxlint skips member-expression receivers.
 * no-misleading-character-class: oxlint skips RegExp patterns held in constants.
 * unicorn/prefer-regexp-test: oxlint skips match calls on string literals.
 * Keep @eslint-community/eslint-plugin-eslint-comments in ESLint:
 * all six enabled rules can throw RangeError in oxlint when they report directives.
 * Keep @eslint-react/eslint-plugin and @tanstack/eslint-plugin-start in ESLint:
 * oxlint's JS-plugin API gives getParserServices no type information, even with
 * --type-aware, so their type-aware rules throw and oxlint exits 1.
 * Oxlint then drops all other JS-plugin diagnostics for that file.
 */
import e18e from "@e18e/eslint-plugin";
import eslint from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import pluginStart from "@tanstack/eslint-plugin-start";
import { defineConfig, globalIgnores } from "eslint/config";
import love from "eslint-config-love";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import jsxA11yX from "eslint-plugin-jsx-a11y-x";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import oxlint from "eslint-plugin-oxlint";
import reactHooks from "eslint-plugin-react-hooks";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import regexp from "eslint-plugin-regexp";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import eslintPluginZod from "eslint-plugin-zod";
import globals from "globals";
import tseslint from "typescript-eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./eslint-config/constants.js";
import { duplicateAndConflictRules } from "./eslint-config/rule-exceptions.js";
import { testRules } from "./eslint-config/test-rules.js";
import metadataScrubber from "./oxlint-plugin-metadata-scrubber/index.ts";

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
      [`${PLUGIN_NAMES.SimpleImportSort}/exports`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SimpleImportSort}/imports`]: SEVERITY_LEVELS.Error,
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
    settings: {
      // TypeScript modules need both resolution and inspection for cycle checks.
      [`${PLUGIN_NAMES.ImportX}/extensions`]: [
        ".js",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
      ],
      // The Node resolver reads #/* from package imports without another dependency.
      [`${PLUGIN_NAMES.ImportX}/resolver-next`]: [
        createNodeResolver({
          extensions: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".json", ".node"],
        }),
      ],
    },
    rules: {
      // Stable module boundaries prevent cycles and shared mutable exports.
      [`${PLUGIN_NAMES.ImportX}/no-mutable-exports`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/no-self-import`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ImportX}/no-cycle`]: [
        SEVERITY_LEVELS.Error,
        {
          ignoreExternal: true,
        },
      ],
      [`${PLUGIN_NAMES.ImportX}/no-useless-path-segments`]:
        SEVERITY_LEVELS.Error,
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
      [`${PLUGIN_NAMES.ImportX}/no-webpack-loader-syntax`]:
        SEVERITY_LEVELS.Error,
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
      [`${PLUGIN_NAMES.MetadataScrubber}/no-classes`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-expect-type-of`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-hardcoded-backend-host`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-mutable-module-state-in-server-code`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-silent-test-prerequisite`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/no-use-query`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/separate-type-imports`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/use-effect-in-custom-hook`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.MetadataScrubber}/use-shared-render-helper`]:
        SEVERITY_LEVELS.Error,
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
        SEVERITY_LEVELS.Error,
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
    plugins: {
      [PLUGIN_NAMES.Regexp]: regexp,
      [PLUGIN_NAMES.NoUnsanitized]: noUnsanitized,
      [PLUGIN_NAMES.BetterTailwindcss]: betterTailwindcss,
    },
    settings: {
      [PLUGIN_NAMES.BetterTailwindcss]: {
        // Tailwind v4 reads the theme and plugins from the CSS entry point.
        entryPoint: "src/app.css",
      },
    },
    rules: {
      // These checks prevent misleading captures and ineffective regex operations.
      [`${PLUGIN_NAMES.Regexp}/no-misleading-capturing-group`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Regexp}/no-useless-assertions`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Regexp}/no-missing-g-flag`]: SEVERITY_LEVELS.Error,
      // HTML sinks need sanitized values to prevent injection.
      [`${PLUGIN_NAMES.NoUnsanitized}/method`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.NoUnsanitized}/property`]: SEVERITY_LEVELS.Error,
      // Invalid, conflicting, or partial classes can leave the UI without its styles.
      [`${PLUGIN_NAMES.BetterTailwindcss}/no-unknown-classes`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.BetterTailwindcss}/no-conflicting-classes`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.BetterTailwindcss}/no-concatenated-classes`]:
        SEVERITY_LEVELS.Error,
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      // Render purity prevents shared state changes and premature ref access.
      [`${PLUGIN_NAMES.ESLintReact}/globals`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/immutability`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/refs`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ReactHooks}/capitalized-calls`]: SEVERITY_LEVELS.Error,
      // Context names make component diagnostics useful.
      [`${PLUGIN_NAMES.ESLintReact}/no-missing-context-display-name`]:
        SEVERITY_LEVELS.Error,
      // Schema checks must allow valid data without hidden key changes.
      [`${PLUGIN_NAMES.Zod}/no-conflicting-checks`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Zod}/no-transform-in-record-key`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Zod}/no-unnecessary-readonly`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Zod}/prefer-validate`]: SEVERITY_LEVELS.Error,
    },
  },
  {
    files: ["src/**/*.tsx"],
    rules: {
      // Explicit keys, refs, and names make component identity clear.
      [`${PLUGIN_NAMES.ESLintReact}/no-duplicate-key`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/no-implicit-key`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/no-implicit-ref`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/no-missing-component-display-name`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintReact}/dom-no-unknown-property`]:
        SEVERITY_LEVELS.Error,
      // Native controls and valid labels keep the UI accessible.
      [`${PLUGIN_NAMES.JSXA11yX}/anchor-ambiguous-text`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.JSXA11yX}/control-has-associated-label`]: [
        SEVERITY_LEVELS.Error,
        {
          labelAttributes: [],
          controlComponents: [],
          ignoreElements: [
            "audio",
            "canvas",
            "embed",
            "input",
            "textarea",
            "tr",
            "video",
          ],
          ignoreRoles: [
            "grid",
            "listbox",
            "menu",
            "menubar",
            "radiogroup",
            "row",
            "tablist",
            "toolbar",
            "tree",
            "treegrid",
          ],
        },
      ],
      [`${PLUGIN_NAMES.JSXA11yX}/lang`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.JSXA11yX}/no-aria-hidden-on-focusable`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.JSXA11yX}/prefer-tag-over-role`]: SEVERITY_LEVELS.Error,
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Explicit returns and numeric conversion prevent silent value errors.
      "getter-return": SEVERITY_LEVELS.Error,
      "no-implicit-coercion": [
        SEVERITY_LEVELS.Error,
        { boolean: false, number: true, string: false },
      ],
      // Distinct bindings and trailing defaults keep argument use clear.
      [`${PLUGIN_NAMES.TypescriptESLint}/default-param-last`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.TypescriptESLint}/no-shadow`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Unicorn}/consistent-destructuring`]:
        SEVERITY_LEVELS.Error,
      // Promise APIs and strict assertions give Node calls clear contracts.
      [`${PLUGIN_NAMES.Node}/prefer-import/assert-strict`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Node}/prefer-promises/dns`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Node}/prefer-promises/fs`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Unicorn}/prefer-import-meta-properties`]:
        SEVERITY_LEVELS.Error,
      // Direct modules and used properties keep dependencies visible.
      [`${PLUGIN_NAMES.Unicorn}/no-barrel-files`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.Unicorn}/no-unused-properties`]: SEVERITY_LEVELS.Error,
      // Safe DOM calls prevent HTML injection.
      [`${PLUGIN_NAMES.Unicorn}/no-unsafe-dom-html`]: SEVERITY_LEVELS.Error,
      // A shared collator avoids allocation in each sort comparison.
      [`${PLUGIN_NAMES.E18e}/prefer-static-collator`]: SEVERITY_LEVELS.Error,
      // Block declarations and iterable keys can behave unlike their intent.
      [`${PLUGIN_NAMES.SonarJS}/no-function-declaration-in-block`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SonarJS}/no-for-in-iterable`]: SEVERITY_LEVELS.Error,

      // Line-level exceptions need a rule name and a reason for review.
      [`${PLUGIN_NAMES.ESLintCommunityComments}/no-use`]: [
        SEVERITY_LEVELS.Error,
        {
          allow: ["eslint-disable-next-line"],
          additionalDirectives: [
            "oxlint-disable",
            "oxlint-disable-line",
            "oxlint-disable-next-line",
            "oxlint-enable",
          ],
        },
      ],
      [`${PLUGIN_NAMES.ESLintCommunityComments}/require-description`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.ESLintCommunityComments}/no-unlimited-disable`]:
        SEVERITY_LEVELS.Error,

      ...duplicateAndConflictRules,

      [`${PLUGIN_NAMES.ESLintCommunityComments}/disable-enable-pair`]:
        SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.TypescriptESLint}/consistent-type-imports`]: [
        SEVERITY_LEVELS.Error,
        {
          fixStyle: "separate-type-imports",
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/explicit-function-return-type`]:
        SEVERITY_LEVELS.Off,
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
        SEVERITY_LEVELS.Error,
        {
          max: 3,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-deprecated`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.TypescriptESLint}/no-floating-promises`]: [
        SEVERITY_LEVELS.Error,
        {
          checkThenables: true,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-magic-numbers`]: [
        SEVERITY_LEVELS.Error,
        {
          ignoreTypeIndexes: true,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/no-misused-promises`]: [
        SEVERITY_LEVELS.Error,
        {
          checksVoidReturn: false,
        },
      ],
      [`${PLUGIN_NAMES.TypescriptESLint}/only-throw-error`]: [
        SEVERITY_LEVELS.Error,
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
        SEVERITY_LEVELS.Error,
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
        SEVERITY_LEVELS.Error,
        "in-try-catch",
      ],
      "arrow-body-style": SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.ImportX}/newline-after-import`]: SEVERITY_LEVELS.Error,
      /**
       * The zod package root is the only supported entry point.
       * In .oxlintrc.json, the user replaces this regex with a zod/** group by
       * hand. That manual change keeps the same policy.
       */
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          patterns: [
            {
              regex: "^zod/.+$",
              message:
                'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
            },
          ],
        },
      ],
      // The project replaces each switch statement with a lookup map.
      // The lookup map raises an error for each unknown key.
      "no-restricted-syntax": [
        SEVERITY_LEVELS.Error,
        {
          selector: "SwitchStatement",
          message:
            "Use a lookup map that raises an error for unknown keys instead.",
        },
      ],
      // The project uses null as the one explicit absent value.
      // Prefer null over undefined as the explicit empty value.
      "no-undefined": SEVERITY_LEVELS.Error,
      "object-shorthand": SEVERITY_LEVELS.Error,
      "react-hooks/exhaustive-deps": SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SonarJS}/cognitive-complexity`]: [
        SEVERITY_LEVELS.Error,
        MAX_COMPLEXITY,
      ],
      [`${PLUGIN_NAMES.SonarJS}/no-commented-code`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SonarJS}/todo-tag`]: SEVERITY_LEVELS.Error,
      /**
       * The project uses these established terms.
       * mod comes from the *.mod.ts file-name convention.
       * props and Props come from React.
       * ref also comes from React. The @eslint-react/naming-convention-ref-name
       * rule requires ref or a Ref suffix.
       */
      [`${PLUGIN_NAMES.Unicorn}/name-replacements`]: [
        SEVERITY_LEVELS.Error,
        {
          replacements: {
            mod: false,
            props: false,
            ref: false,
          },
        },
      ],
      // Keep null legal because the project uses it as the one explicit absent value.
      [`${PLUGIN_NAMES.Unicorn}/no-null`]: SEVERITY_LEVELS.Off,
      [`${PLUGIN_NAMES.Unicorn}/text-encoding-identifier-case`]: [
        SEVERITY_LEVELS.Error,
        {
          withDash: true,
        },
      ],
      complexity: [
        SEVERITY_LEVELS.Error,
        {
          variant: "modified",
          max: MAX_COMPLEXITY,
        },
      ],
      // The project requires loose equality against null.
      // One comparison then covers both null and undefined.
      eqeqeq: [
        SEVERITY_LEVELS.Error,
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
  // Oxlint needs explicit globs because it does not support extglobs.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: [
      "eslint.config.js",
      "eslint-config/**/*.js",
      "scripts/**/*.ts",
      "vite.config.ts",
      "vitest.config.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      "oxlint-plugin-metadata-scrubber/**/*.ts",
      "oxlint-plugin-metadata-scrubber/**/*.tsx",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...testRules,
  {
    files: ["oxlint-plugin-metadata-scrubber/check-fixtures.ts"],
    rules: {
      // This file is a CLI harness. Console output is its user interface.
      "no-console": SEVERITY_LEVELS.Off,
    },
  },
  /**
   * This final oxlint entry turns off ESLint rules that the bridge
   * maps to enabled Oxlint rules.
   * All nine custom rules still run in both tools.
   */
  oxlint.buildFromOxlintConfigFile("./.oxlintrc.json", {
    typeAware: true,
  }),
  {
    // Keep this block after the bridge, even when .oxlintrc.json enables these rules.
    // ESLint must keep the full policy where native oxlint checks miss cases.
    rules: {
      [`${PLUGIN_NAMES.Promise}/prefer-catch`]: [SEVERITY_LEVELS.Error],
      [`${PLUGIN_NAMES.Unicorn}/prefer-string-raw`]: [SEVERITY_LEVELS.Error],
      [`${PLUGIN_NAMES.Unicorn}/no-array-callback-reference`]: [
        SEVERITY_LEVELS.Error,
        { ignore: [] },
      ],
      "no-misleading-character-class": [
        SEVERITY_LEVELS.Error,
        { allowEscape: false },
      ],
      [`${PLUGIN_NAMES.Unicorn}/prefer-regexp-test`]: [SEVERITY_LEVELS.Error],
    },
  },
  globalIgnores([
    ".output/",
    "coverage/",
    "oxlint-plugin-metadata-scrubber/fixtures/",
    "src/routeTree.gen.ts",
  ]),
);

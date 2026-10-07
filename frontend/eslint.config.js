/**
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
import noUnsanitized from "eslint-plugin-no-unsanitized";
import oxlint from "eslint-plugin-oxlint";
import reactHooks from "eslint-plugin-react-hooks";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import eslintPluginZod from "eslint-plugin-zod";
import tseslint from "typescript-eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./eslint-config/constants.js";
import { directiveCommentRules } from "./eslint-config/directive-comment-rules.js";
import { importRestrictionRules } from "./eslint-config/import-restriction-rules.js";
import { importXRules } from "./eslint-config/import-x-rules.js";
import { jsxA11yRules } from "./eslint-config/jsx-a11y-rules.js";
import { metadataScrubberRules } from "./eslint-config/metadata-scrubber-rules.js";
import { reactRules } from "./eslint-config/react-rules.js";
import { regexpRules } from "./eslint-config/regexp-rules.js";
import { duplicateAndConflictRules } from "./eslint-config/rule-exceptions.js";
import { simpleImportSortRules } from "./eslint-config/simple-import-sort-rules.js";
import { sourceRules } from "./eslint-config/source-rules.js";
import { syntaxRules } from "./eslint-config/syntax-rules.js";
import { tailwindcssRules } from "./eslint-config/tailwindcss-rules.js";
import { testRules } from "./eslint-config/test-rules.js";
import { toolingRules } from "./eslint-config/tooling-rules.js";
import { typescriptRules } from "./eslint-config/typescript-rules.js";
import { unicornRules } from "./eslint-config/unicorn-rules.js";

const MAX_COMPLEXITY = 8;

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...simpleImportSortRules,
  // @ts-expect-error Type incompatibility between @typescript-eslint/utils re-exported types and defineConfig.
  // This is a known issue with plugins using TSESLint.FlatConfig types.
  // See: https://github.com/typescript-eslint/typescript-eslint/issues/11543
  love,
  ...importXRules,
  unicorn.configs.recommended,
  e18e.configs.recommended,
  sonarjs.configs?.["recommended"],
  ...metadataScrubberRules,
  eslintReact.configs["strict-type-checked"],
  reactHooks.configs.flat["recommended-latest"],
  reactYouMightNotNeedAnEffect.configs.strict,
  ...jsxA11yRules,
  pluginRouter.configs["flat/recommended"],
  pluginStart.configs["flat/recommended"],
  pluginQuery.configs["flat/recommended-strict"],
  eslintPluginZod.configs.recommended,
  ...regexpRules,
  {
    plugins: {
      [PLUGIN_NAMES.NoUnsanitized]: noUnsanitized,
    },
    rules: {
      // HTML sinks need sanitized values to prevent injection.
      [`${PLUGIN_NAMES.NoUnsanitized}/method`]: SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.NoUnsanitized}/property`]: SEVERITY_LEVELS.Error,
    },
  },
  ...tailwindcssRules,
  ...sourceRules,
  ...reactRules,
  {
    linterOptions: {
      noInlineConfig: true,
    },
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

      ...directiveCommentRules,

      ...duplicateAndConflictRules,

      ...typescriptRules,
      "arrow-body-style": SEVERITY_LEVELS.Off,
      ...importRestrictionRules,
      ...syntaxRules,
      "react-hooks/exhaustive-deps": SEVERITY_LEVELS.Error,
      [`${PLUGIN_NAMES.SonarJS}/cognitive-complexity`]: [
        SEVERITY_LEVELS.Error,
        MAX_COMPLEXITY,
      ],
      [`${PLUGIN_NAMES.SonarJS}/no-commented-code`]: SEVERITY_LEVELS.Error,
      ...unicornRules,
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
  ...toolingRules,
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
   * All eight custom rules still run in both tools.
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

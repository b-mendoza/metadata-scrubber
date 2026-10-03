import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const duplicateAndConflictRules = {
  /**
   * These rules duplicate enabled core, unicorn, or typescript-eslint rules.
   * Core `prefer-object-has-own` covers `e18e/prefer-object-has-own`.
   * `@typescript-eslint/prefer-regexp-exec` covers `sonarjs/prefer-regexp-exec`.
   * `e18e/prefer-string-fromcharcode` and `e18e/prefer-array-fill` instead
   * conflict with `unicorn/prefer-code-point` and `unicorn/no-array-from-fill`.
   */
  // =======================================================================
  [`${PLUGIN_NAMES.E18e}/prefer-array-at`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-array-fill`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-array-some`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-array-to-reversed`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-array-to-sorted`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-date-now`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-includes`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-nullish-coalescing`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-object-has-own`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-spread-syntax`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-string-fromcharcode`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/prefer-regexp-exec`]: SEVERITY_LEVELS.Off,

  // These rules prefer patterns that other enabled rules forbid.
  [`${PLUGIN_NAMES.Unicorn}/prefer-switch`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-typeof-undefined`]: SEVERITY_LEVELS.Off,
  "no-extra-boolean-cast": SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-useless-boolean-cast`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.TypescriptESLint}/non-nullable-type-assertion-style`]:
    SEVERITY_LEVELS.Off,

  // These rules can crash lint or change program behavior with an autofix.
  [`${PLUGIN_NAMES.SonarJS}/no-regex-spaces`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-array-to-spliced`]: SEVERITY_LEVELS.Off,

  // Other enabled rules report the same code.
  [`${PLUGIN_NAMES.ESLintReact}/error-boundaries`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/exhaustive-deps`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/purity`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/rules-of-hooks`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/set-state-in-render`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/static-components`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/unsupported-syntax`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/use-memo`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/no-leaked-conditional-rendering`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/jsx-no-leaked-render`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-hook-setter-in-body`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/jsx-no-children-prop-with-children`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintReact}/dom-no-dangerously-set-innerhtml-with-children`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.TypescriptESLint}/no-import-type-side-effects`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/unused-import`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-unused-vars`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.E18e}/prefer-regex-test`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/prefer-native-lodash-alternative`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-undefined-argument`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.ESLintCommunityComments}/no-unused-enable`]:
    SEVERITY_LEVELS.Off,
  "operator-assignment": SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-useless-concat`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-unnecessary-await`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-this-assignment`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-unnecessary-boolean-comparison`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-useless-coercion`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.TypescriptESLint}/prefer-for-of`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/prefer-string-starts-ends-with`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.TypescriptESLint}/require-array-sort-compare`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-alphabetical-sort`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Promise}/no-return-wrap`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/prefer-then-catch`]: SEVERITY_LEVELS.Off,
  "no-new-wrappers": SEVERITY_LEVELS.Off,
  "no-new-native-nonconstructor": SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-primitive-wrappers`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-new-buffer`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/deprecation`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-magic-array-flat-depth`]: SEVERITY_LEVELS.Off,
  "no-empty-character-class": SEVERITY_LEVELS.Off,
  "no-invalid-regexp": SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/no-nested-ternary`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/call-argument-line`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/constructor-for-side-effects`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-unthrown-error`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/function-inside-loop`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/generator-without-yield`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-labels`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-array-delete`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-collection-size-mischeck`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-dead-store`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-delete-var`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-duplicate-in-composite`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-extra-arguments`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-global-this`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-gratuitous-expressions`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-identical-conditions`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-misleading-array-reverse`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-misleading-character-class`]:
    SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-redundant-jump`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-use-of-empty-return-value`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/no-useless-catch`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/prefer-single-boolean-return`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.SonarJS}/updated-const-var`]: SEVERITY_LEVELS.Off,
  // =======================================================================
};

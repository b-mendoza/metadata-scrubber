import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const typescriptRules = {
  [`${PLUGIN_NAMES.TypescriptESLint}/consistent-type-imports`]: [
    SEVERITY_LEVELS.Error,
    {
      fixStyle: "separate-type-imports",
    },
  ],
  [`${PLUGIN_NAMES.TypescriptESLint}/explicit-function-return-type`]:
    SEVERITY_LEVELS.Off,
  // Keep the main arguments positional and put extra values in trailing options.
  // One object for all arguments hides the main arguments at each call site.
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
      enforceForRenamedProperties: false,
    },
  ],
  [`${PLUGIN_NAMES.TypescriptESLint}/return-await`]: [
    SEVERITY_LEVELS.Error,
    "in-try-catch",
  ],
};

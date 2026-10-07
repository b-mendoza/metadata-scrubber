import { defineConfig } from "eslint/config";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const reactRules = defineConfig({
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
});

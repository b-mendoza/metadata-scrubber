import { defineConfig } from "eslint/config";
import globals from "globals";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const sourceRules = defineConfig(
  // Source files can mix browser and Node code. shared-node-browser omits window and process.
  // Oxlint needs explicit globs because it does not support extglobs.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
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
);

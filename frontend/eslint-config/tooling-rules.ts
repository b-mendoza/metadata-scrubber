import { defineConfig } from "eslint/config";
import globals from "globals";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const toolingRules = defineConfig(
  {
    files: [
      "e2e/**/*.ts",
      "playwright.config.ts",
      "eslint.config.ts",
      "eslint-config/**/*.ts",
      "scripts/**/*.ts",
      "vite.config.ts",
      "vitest.config.ts",
      "oxlint-plugin-metadata-scrubber/**/*.ts",
      "oxlint-plugin-metadata-scrubber/**/*.tsx",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["eslint.config.ts"],
    rules: {
      // ESLint builds global ignore metadata before exporting its configuration.
      [`${PLUGIN_NAMES.Unicorn}/no-top-level-side-effects`]: [
        SEVERITY_LEVELS.Error,
        { allow: { "eslint/config": ["globalIgnores"] } },
      ],
    },
  },
  {
    files: ["oxlint-plugin-metadata-scrubber/index.ts"],
    rules: {
      // definePlugin returns the plugin unchanged and provides its type contract.
      [`${PLUGIN_NAMES.Unicorn}/no-top-level-side-effects`]: [
        SEVERITY_LEVELS.Error,
        { allow: { "@oxlint/plugins": ["definePlugin"] } },
      ],
    },
  },
  {
    files: ["oxlint-plugin-metadata-scrubber/rules/*.ts"],
    rules: {
      // defineRule returns each rule unchanged and types its visitor callbacks.
      [`${PLUGIN_NAMES.Unicorn}/no-top-level-side-effects`]: [
        SEVERITY_LEVELS.Error,
        { allow: { "@oxlint/plugins": ["defineRule"] } },
      ],
    },
  },
);

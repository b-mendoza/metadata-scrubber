import { defineConfig } from "eslint/config";
import globals from "globals";

export const toolingRules = defineConfig({
  files: [
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
});

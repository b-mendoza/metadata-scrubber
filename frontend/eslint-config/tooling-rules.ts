import { defineConfig } from "eslint/config";
import globals from "globals";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";
import { restrictedSyntax } from "./syntax-rules.ts";

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
      // Shared message templates keep diagnostics consistent and testable.
      "no-restricted-syntax": [
        SEVERITY_LEVELS.Error,
        ...restrictedSyntax,
        {
          selector:
            "CallExpression[callee.object.name='context']:matches([callee.property.name='report'], [callee.property.value='report']) > ObjectExpression > Property:matches([key.name='message'], [key.value='message'])",
          message:
            "context.report uses inline message text instead of a shared template. Add the template to meta.messages, then report with messageId and data so diagnostics stay consistent.",
        },
        {
          selector:
            "ExportDefaultDeclaration:not([declaration.type='CallExpression'][declaration.callee.name='defineRule'])",
          message:
            "This default export does not show the defineRule call that checks the rule contract. Use export default defineRule({ meta, create }) so the export states that contract.",
        },
      ],
      // defineRule returns each rule unchanged and types its visitor callbacks.
      [`${PLUGIN_NAMES.Unicorn}/no-top-level-side-effects`]: [
        SEVERITY_LEVELS.Error,
        { allow: { "@oxlint/plugins": ["defineRule"] } },
      ],
    },
  },
  {
    files: ["e2e/**"],
    rules: {
      "no-restricted-syntax": [
        SEVERITY_LEVELS.Error,
        ...restrictedSyntax,
        {
          selector:
            "CallExpression[callee.type='MemberExpression']:matches([callee.property.name=/^(route|routeFromHAR|routeWebSocket)$/], [callee.property.value=/^(route|routeFromHAR|routeWebSocket)$/])",
          message:
            "route, routeFromHAR, and routeWebSocket replace real network behavior in an end-to-end test. Remove the mocking call and use the real frontend and backend services.",
        },
      ],
    },
  },
  {
    files: ["playwright.config.ts"],
    rules: {
      // The operator starts both services before the end-to-end suite.
      "no-restricted-syntax": [
        SEVERITY_LEVELS.Error,
        ...restrictedSyntax,
        {
          selector:
            "Property:matches([key.name='webServer'], [key.value='webServer'])",
          message:
            "A webServer property makes Playwright start services. Remove webServer from defineConfig and start the frontend and backend before running the suite.",
        },
      ],
    },
  },
);

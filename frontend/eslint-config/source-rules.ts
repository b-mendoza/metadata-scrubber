import { defineConfig } from "eslint/config";
import globals from "globals";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";
import { restrictedSyntax } from "./syntax-rules.ts";

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
  {
    files: ["src/**/*.server.ts"],
    rules: {
      // A broad catch can map programming errors as dependency failures.
      "no-restricted-syntax": [
        SEVERITY_LEVELS.Error,
        ...restrictedSyntax,
        {
          selector: "TryStatement",
          message:
            "A server try/catch can catch programming errors as dependency failures. Await ResultAsync.fromPromise for the dependency call, check result.isErr(), then throw result.error at the tRPC boundary.",
        },
      ],
    },
  },
  {
    files: [
      "src/**/*.mod.server.{ts,tsx}",
      "src/shared/database/**/*.server.{ts,tsx}",
      "src/routes/api/**/*.{ts,tsx}",
      "src/shared/middlewares/**/*.{ts,tsx}",
    ],
    rules: {
      [`${PLUGIN_NAMES.CorePolicy}/server-module-state`]: [
        SEVERITY_LEVELS.Error,
        {
          selector:
            "Program > VariableDeclaration[kind=/^(let|var)$/], Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]",
          message:
            "Concurrent server requests share this module-scope let or var state. Move request-local mutation into request scope. Put request dependencies in `appBindingsMiddleware` and read them with `getAppBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.mod.tsx"],
    ignores: ["src/routes/**"],
    rules: {
      [`${PLUGIN_NAMES.CorePolicy}/module-jsx`]: [
        SEVERITY_LEVELS.Error,
        {
          selector: "Program:not(:has(JSXElement, JSXFragment))",
          message:
            "This .mod.tsx file contains no JSX. Rename it to .mod.ts and update its imports.",
        },
      ],
    },
  },
);

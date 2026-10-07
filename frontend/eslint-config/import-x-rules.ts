import { defineConfig } from "eslint/config";
import { createNodeResolver, importX } from "eslint-plugin-import-x";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const importXRules = defineConfig(
  // This block replaces rules removed in Love v155.
  // Reconsider it only when published Love provides equivalent rules,
  // supported peers, and the same rule ownership.
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
);

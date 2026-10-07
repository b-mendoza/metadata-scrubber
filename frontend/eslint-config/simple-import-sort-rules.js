import { defineConfig } from "eslint/config";
import simpleImportSort from "eslint-plugin-simple-import-sort";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const simpleImportSortRules = defineConfig({
  plugins: {
    [PLUGIN_NAMES.SimpleImportSort]: simpleImportSort,
  },
  rules: {
    [`${PLUGIN_NAMES.SimpleImportSort}/exports`]: SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.SimpleImportSort}/imports`]: SEVERITY_LEVELS.Error,
  },
});

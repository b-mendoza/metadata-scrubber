import { defineConfig } from "eslint/config";
import regexp from "eslint-plugin-regexp";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const regexpRules = defineConfig({
  plugins: {
    [PLUGIN_NAMES.Regexp]: regexp,
  },
  rules: {
    // These checks prevent misleading captures and ineffective regex operations.
    [`${PLUGIN_NAMES.Regexp}/no-misleading-capturing-group`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.Regexp}/no-useless-assertions`]: SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.Regexp}/no-missing-g-flag`]: SEVERITY_LEVELS.Error,
  },
});

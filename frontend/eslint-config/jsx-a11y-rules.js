import { defineConfig } from "eslint/config";
import jsxA11yX from "eslint-plugin-jsx-a11y-x";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const jsxA11yRules = defineConfig({
  plugins: {
    [PLUGIN_NAMES.JSXA11yX]: jsxA11yX,
  },
  rules: {
    ...jsxA11yX.configs.strict.rules,
    [`${PLUGIN_NAMES.JSXA11yX}/anchor-has-content`]: [
      SEVERITY_LEVELS.Error,
      {
        components: ["Link", "NavLink"],
      },
    ],
  },
});

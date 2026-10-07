import { defineConfig } from "eslint/config";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const tailwindcssRules = defineConfig({
  plugins: {
    [PLUGIN_NAMES.BetterTailwindcss]: betterTailwindcss,
  },
  settings: {
    [PLUGIN_NAMES.BetterTailwindcss]: {
      // Tailwind v4 reads the theme and plugins from the CSS entry point.
      entryPoint: "src/app.css",
    },
  },
  rules: {
    // Invalid, conflicting, or partial classes can leave the UI without its styles.
    [`${PLUGIN_NAMES.BetterTailwindcss}/no-unknown-classes`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.BetterTailwindcss}/no-conflicting-classes`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.BetterTailwindcss}/no-concatenated-classes`]:
      SEVERITY_LEVELS.Error,
  },
});

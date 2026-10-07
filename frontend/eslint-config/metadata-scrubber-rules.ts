import { defineConfig } from "eslint/config";

import metadataScrubber from "../oxlint-plugin-metadata-scrubber/index.ts";
import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const metadataScrubberRules = defineConfig({
  // @ts-expect-error TS2322: @oxlint/plugins allows meta.fixable: null and uses an Oxlint rule context. https://github.com/oxc-project/oxc/pull/20008
  plugins: {
    [PLUGIN_NAMES.MetadataScrubber]: metadataScrubber,
  },
  rules: {
    [`${PLUGIN_NAMES.MetadataScrubber}/no-classes`]: SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-expect-type-of`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-hardcoded-backend-host`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-mutable-module-state-in-server-code`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-silent-test-prerequisite`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/separate-type-imports`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/use-effect-in-custom-hook`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/use-shared-render-helper`]:
      SEVERITY_LEVELS.Error,
  },
});

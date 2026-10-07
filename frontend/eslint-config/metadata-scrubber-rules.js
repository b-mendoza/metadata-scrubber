import metadataScrubber from "../oxlint-plugin-metadata-scrubber/index.ts";
import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.js";

export const metadataScrubberRules = [
  {
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
  },
];

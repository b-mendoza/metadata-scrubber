import { defineConfig } from "eslint/config";

import metadataScrubber from "../oxlint-plugin-metadata-scrubber/index.ts";
import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const metadataScrubberRules = defineConfig({
  // @ts-expect-error TS2322: @oxlint/plugins allows meta.fixable: null and uses an Oxlint rule context. https://github.com/oxc-project/oxc/pull/20008
  plugins: {
    [PLUGIN_NAMES.MetadataScrubber]: metadataScrubber,
  },
  rules: {
    [`${PLUGIN_NAMES.MetadataScrubber}/no-discarded-result`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-late-request-body-read`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-module-scope-http-client`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-query-client-props`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/no-silent-test-prerequisite`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/prefetch-route-data-without-waiting`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/require-backend-request-signal`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/require-colocated-test`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/require-ky-json-schema`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/require-relative-backend-path`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/require-strict-msw-server`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/use-effect-in-custom-hook`]:
      SEVERITY_LEVELS.Error,
    [`${PLUGIN_NAMES.MetadataScrubber}/use-shared-render-helper`]:
      SEVERITY_LEVELS.Error,
  },
});

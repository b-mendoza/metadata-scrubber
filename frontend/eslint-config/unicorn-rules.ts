import type { Linter } from "eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const unicornRules = {
  // mod follows file names; props and ref are React terms.
  // The ref-name rule also requires ref or a Ref suffix.
  [`${PLUGIN_NAMES.Unicorn}/name-replacements`]: [
    SEVERITY_LEVELS.Error,
    {
      replacements: {
        mod: false,
        props: false,
        ref: false,
      },
    },
  ],
  [`${PLUGIN_NAMES.Unicorn}/no-null`]: SEVERITY_LEVELS.Off,
  [`${PLUGIN_NAMES.Unicorn}/text-encoding-identifier-case`]: [
    SEVERITY_LEVELS.Error,
    {
      withDash: true,
    },
  ],
} satisfies Linter.RulesRecord;

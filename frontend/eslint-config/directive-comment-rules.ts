import type { Linter } from "eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const directiveCommentRules = {
  // Fix the reported code instead of adding a lint directive.
  [`${PLUGIN_NAMES.ESLintCommunityComments}/no-use`]: [
    SEVERITY_LEVELS.Error,
    {
      additionalDirectives: [
        "eslint-disable",
        "oxlint-disable",
        "oxlint-disable-line",
        "oxlint-disable-next-line",
        "oxlint-enable",
      ],
    },
  ],
  // Fix the reported code instead of adding a suppression comment.
  "no-warning-comments": [
    SEVERITY_LEVELS.Error,
    { terms: ["react-doctor-disable"], location: "anywhere" },
  ],
} satisfies Linter.RulesRecord;

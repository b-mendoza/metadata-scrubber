import type { Linter } from "eslint";

import { SEVERITY_LEVELS } from "./constants.ts";

export const syntaxRules = {
  "no-restricted-syntax": [
    SEVERITY_LEVELS.Error,
    {
      selector: "SwitchStatement",
      message:
        "Use a lookup map that raises an error for unknown keys instead.",
    },
    {
      selector: "ImportExpression[source.value='@tanstack/react-query']",
      message:
        "Import @tanstack/react-query statically with named imports. A dynamic import exposes useQuery and hides it from the import restriction.",
    },
  ],
  "no-undefined": SEVERITY_LEVELS.Error,
  "object-shorthand": SEVERITY_LEVELS.Error,
} satisfies Linter.RulesRecord;

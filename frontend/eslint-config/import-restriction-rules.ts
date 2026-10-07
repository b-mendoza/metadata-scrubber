import type { Linter } from "eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

export const importRestrictionRules = {
  [`${PLUGIN_NAMES.ImportX}/newline-after-import`]: SEVERITY_LEVELS.Error,
  /**
   * The zod package root is the only supported entry point.
   * In .oxlintrc.json, the user replaces this regex with a zod/** group by
   * hand. That manual change keeps the same policy.
   */
  "no-restricted-imports": [
    SEVERITY_LEVELS.Error,
    {
      paths: [
        {
          name: "@tanstack/react-query",
          importNames: ["useQuery"],
          allowTypeImports: true,
          message:
            "Runtime useQuery does not suspend for pending data. Use named useSuspenseQuery imports with an ancestor Suspense boundary and suitable error handling. Replace namespace imports and wildcard exports with explicit allowed APIs.",
        },
      ],
      patterns: [
        {
          regex: "^zod/.+$",
          message:
            'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
        },
      ],
    },
  ],
} satisfies Linter.RulesRecord;

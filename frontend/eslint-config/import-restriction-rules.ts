import type { Linter } from "eslint";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

// Each query API needs its own repair message, including source re-exports.
export const restrictedQueryImports = [
  {
    name: "@tanstack/react-query",
    importNames: ["useQuery"],
    allowTypeImports: true,
    message:
      "Runtime useQuery does not suspend for pending data. Use named useSuspenseQuery imports with an ancestor Suspense boundary and suitable error handling. Replace namespace imports and wildcard exports with explicit allowed APIs.",
  },
  {
    name: "@tanstack/react-query",
    importNames: ["useQueries"],
    allowTypeImports: true,
    message:
      "Runtime useQueries does not suspend for pending data. Replace it with named useSuspenseQueries imports, an ancestor Suspense boundary, and suitable error handling. Replace namespace imports and wildcard exports with explicit allowed APIs.",
  },
  {
    name: "@tanstack/react-query",
    importNames: ["useInfiniteQuery"],
    allowTypeImports: true,
    message:
      "Runtime useInfiniteQuery does not suspend for pending data. Replace it with named useSuspenseInfiniteQuery imports, an ancestor Suspense boundary, and suitable error handling. Replace namespace imports and wildcard exports with explicit allowed APIs.",
  },
];

// Result wrappers belong only at server dependency boundaries and in scripts.
export const restrictedImports = [
  ...restrictedQueryImports,
  {
    name: "neverthrow",
    message:
      "neverthrow is not allowed outside non-test src/**/*.server.ts files and scripts. Use async/await in this file. Keep ResultAsync.fromPromise in a non-test server module for dependency failures.",
  },
];

/**
 * The zod package root is the only supported entry point.
 * In .oxlintrc.json, the user replaces this regex with a zod/** group by
 * hand. That manual change keeps the same policy.
 */
export const restrictedImportPatterns = [
  {
    regex: "^zod/.+$",
    message:
      'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
  },
];

// The alias keeps source imports independent of the caller's directory.
export const sourceRestrictedImportPatterns = [
  ...restrictedImportPatterns,
  {
    regex: String.raw`^\.{1,2}/`,
    message:
      "Relative source imports depend on the caller's directory. Replace ./ or ../ with the #/ alias and the path from src/.",
  },
];

export const importRestrictionRules = {
  [`${PLUGIN_NAMES.ImportX}/newline-after-import`]: SEVERITY_LEVELS.Error,
  "no-restricted-imports": [
    SEVERITY_LEVELS.Error,
    { paths: restrictedImports, patterns: restrictedImportPatterns },
  ],
} satisfies Linter.RulesRecord;

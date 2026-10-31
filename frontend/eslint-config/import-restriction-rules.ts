import { defineConfig } from "eslint/config";

import { SEVERITY_LEVELS } from "./constants.ts";

// Each query API needs its own repair message, including source re-exports.
const restrictedQueryImports = [
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
const restrictedImports = [
  ...restrictedQueryImports,
  {
    name: "neverthrow",
    message:
      "neverthrow is not allowed outside non-test src/**/*.server.ts files and scripts. Use async/await in this file. Keep ResultAsync.fromPromise in a non-test server module for dependency failures.",
  },
];

// The zod package root is the only supported entry point.
const restrictedImportPatterns = [
  {
    regex: "^zod/.+$",
    message:
      'Import Zod from the `zod` package root. Use `import * as z from "zod"` for runtime code or `import type * as z from "zod"` for type-only code. Replace every `zod/*` source with `zod`. The package root is the only supported project entry point.',
  },
];

// The alias keeps source imports independent of the caller's directory.
const sourceRestrictedImportPatterns = [
  ...restrictedImportPatterns,
  {
    regex: String.raw`^\.{1,2}/`,
    message:
      "Relative source imports depend on the caller's directory. Replace ./ or ../ with the #/ alias and the path from src/.",
  },
];

export const importRestrictionRules = defineConfig(
  {
    rules: {
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        { paths: restrictedImports, patterns: restrictedImportPatterns },
      ],
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      // Source imports keep the global bans and use the stable #/ alias.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          paths: restrictedImports,
          patterns: sourceRestrictedImportPatterns,
        },
      ],
    },
  },
  {
    files: ["src/**/*.server.ts"],
    rules: {
      // Server boundaries use ResultAsync; source paths still use the alias.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          paths: restrictedQueryImports,
          patterns: sourceRestrictedImportPatterns,
        },
      ],
    },
  },
  {
    files: ["src/routes/**/*.ts", "src/routes/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      // Route tests do not read route data; route components use their context.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          paths: [
            ...restrictedImports,
            {
              name: "#/shared/libs/trpc/client/client-runtime.mod",
              importNames: ["trpcContext"],
              allowTypeImports: true,
              message:
                "trpcContext bypasses route context in a route file. Read trpc from loader context in a loader, or from Route.useRouteContext() in a component. Keep TRPCProvider setup outside route files.",
            },
            {
              name: "@tanstack/react-query",
              importNames: ["useQueryClient"],
              allowTypeImports: true,
              message:
                "useQueryClient bypasses route context in a route file. Read queryClient from loader context in a loader, or from Route.useRouteContext() in a component.",
            },
          ],
          patterns: sourceRestrictedImportPatterns,
        },
      ],
    },
  },
  {
    files: ["scripts/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // Scripts can use ResultAsync without adding it to browser or test code.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        { paths: restrictedQueryImports, patterns: restrictedImportPatterns },
      ],
    },
  },
  {
    files: ["scripts/hard-clean.ts", "scripts/soft-clean.ts"],
    rules: {
      // Clean scripts must run after node_modules has been removed.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          paths: restrictedImports,
          patterns: [
            ...restrictedImportPatterns,
            {
              group: ["**", "!node:*", "!node:*/**"],
              message:
                "This clean script must run without installed dependencies. Replace this import with a Node built-in whose source starts with node:.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["e2e/**"],
    rules: {
      // End-to-end tests exercise the running services, not mocked responses.
      "no-restricted-imports": [
        SEVERITY_LEVELS.Error,
        {
          paths: restrictedImports,
          patterns: [
            ...restrictedImportPatterns,
            {
              group: ["msw", "msw/**"],
              message:
                "MSW replaces real service responses in an end-to-end test. Remove the msw import and run the test against the real frontend and backend services.",
            },
          ],
        },
      ],
    },
  },
);

import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const CONFIG_LOAD_TIMEOUT_MS = 30_000;

const createLinter = () =>
  new ESLint({
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfigFile: path.join(
      import.meta.dirname,
      "..",
      "eslint.config.ts",
    ),
    // Import restrictions need syntax only. Virtual test paths need no TS project.
    overrideConfig: {
      languageOptions: { parserOptions: { projectService: false } },
    },
    ruleFilter: ({ ruleId }) => ruleId === "no-restricted-imports",
  });

describe("effective import restrictions after the Oxlint bridge", () => {
  const linter = createLinter();

  // Allow time for the cold load of eslint.config.ts and its plugins.
  beforeAll(async () => {
    await linter.calculateConfigForFile("eslint.config.ts");
  }, CONFIG_LOAD_TIMEOUT_MS);

  it.each([
    ["eslint.config.ts", 'import { useQueries } from "@tanstack/react-query";'],
    [
      "eslint-config/constants.ts",
      'import { useInfiniteQuery } from "@tanstack/react-query";',
    ],
    ["vite.config.ts", 'import * as z from "zod/v4";'],
    ["vitest.config.ts", 'import { ResultAsync } from "neverthrow";'],
    [
      "playwright.config.ts",
      'import { useQuery } from "@tanstack/react-query";',
    ],
    [
      "oxlint-plugin-metadata-scrubber/index.ts",
      'import { ResultAsync } from "neverthrow";',
    ],
    ["src/shared/utils/invariant/invariant.mod.ts", 'import "./other.mod";'],
    [
      "src/shared/utils/invariant/invariant.mod.ts",
      'import { ResultAsync } from "neverthrow";',
    ],
    ["src/shared/libs/ky/http-client.mod.server.ts", 'import "../other.mod";'],
    [
      "src/shared/libs/ky/http-client.mod.server.ts",
      'import { useQueries } from "@tanstack/react-query";',
    ],
    [
      "src/shared/libs/ky/http-client.mod.server.test.ts",
      'import { ResultAsync } from "neverthrow";',
    ],
    [
      "src/shared/libs/trpc/client/client-runtime.mod.test.ts",
      'import "./other.mod";',
    ],
    [
      "src/routes/index.tsx",
      'import { useQueryClient } from "@tanstack/react-query";',
    ],
    [
      "src/routes/index.tsx",
      'import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";',
    ],
    ["src/routes/index.tsx", 'import * as z from "zod/v4";'],
    ["src/routes/-root.test.tsx", 'import { ResultAsync } from "neverthrow";'],
    [
      "scripts/check.ts",
      'import { useInfiniteQuery } from "@tanstack/react-query";',
    ],
    ["scripts/check.test.ts", 'import { ResultAsync } from "neverthrow";'],
    ["scripts/hard-clean.ts", 'import { rm } from "fs/promises";'],
    ["scripts/soft-clean.ts", 'import path from "path";'],
    ["e2e/workflow.spec.ts", 'import { http } from "msw";'],
    ["e2e/workflow.spec.ts", 'import { setupServer } from "msw/node";'],
    [
      "e2e/workflow.spec.ts",
      'import { useQueries } from "@tanstack/react-query";',
    ],
  ])("rejects %s: %s", async (filePath, code) => {
    const [result] = await linter.lintText(code, { filePath });

    expect.assert(result != null);
    expect(result.messages).toEqual([
      expect.objectContaining({ ruleId: "no-restricted-imports", severity: 2 }),
    ]);
  });

  it.each([
    [
      "src/shared/libs/ky/http-client.mod.server.ts",
      'import { ResultAsync } from "neverthrow";',
    ],
    ["scripts/check.ts", 'import { ResultAsync } from "neverthrow";'],
    ["scripts/hard-clean.ts", 'import { rm } from "node:fs/promises";'],
    ["scripts/soft-clean.ts", 'import path from "node:path";'],
    [
      "src/routes/-root.test.tsx",
      'import { useQueryClient } from "@tanstack/react-query";',
    ],
    [
      "src/routes/-root.test.tsx",
      'import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";',
    ],
    [
      "src/routes/index.tsx",
      'import type { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";',
    ],
    [
      "src/routes/index.tsx",
      'import type { useQueryClient } from "@tanstack/react-query";',
    ],
    [
      "src/shared/utils/invariant/invariant.mod.ts",
      'import type { useQueries } from "@tanstack/react-query";',
    ],
    [
      "src/shared/utils/invariant/invariant.mod.ts",
      'import * as z from "zod";',
    ],
  ])("allows %s: %s", async (filePath, code) => {
    const [result] = await linter.lintText(code, { filePath });

    expect.assert(result != null);
    expect(result.messages).toEqual([]);
  });
});

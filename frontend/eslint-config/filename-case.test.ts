import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

const NO_DIAGNOSTICS = 0;
const ONE_DIAGNOSTIC = 1;
const CONFIG_LOAD_TIMEOUT_MS = 30_000;
const RULE_ID = `${PLUGIN_NAMES.Unicorn}/filename-case`;

type FilenameCase = readonly [name: string, filePath: string, count: number];

const cases: readonly FilenameCase[] = [
  ["kebab folder and file", "src/good-folder/good-file.mod.ts", NO_DIAGNOSTICS],
  ["PascalCase folder", "src/BadFolder/good-file.mod.ts", ONE_DIAGNOSTIC],
  ["snake_case folder", "src/bad_folder/good-file.mod.ts", ONE_DIAGNOSTIC],
  [
    "deep folder",
    "src/shared/libs/BadFolder/nested/good-file.mod.ts",
    ONE_DIAGNOSTIC,
  ],
  [
    "folder outside src",
    "eslint-config/BadFolder/good-file.ts",
    ONE_DIAGNOSTIC,
  ],
  ["route test name", "src/routes/-root.test.tsx", NO_DIAGNOSTICS],
  ["root route name", "src/routes/__root.tsx", NO_DIAGNOSTICS],
  ["route parameter name", "src/routes/$param.tsx", NO_DIAGNOSTICS],
  ["route folder name", "src/routes/BadFolder/index.tsx", NO_DIAGNOSTICS],
];

describe("filename policy after the Oxlint bridge", () => {
  const linter = new ESLint({
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfigFile: path.join(
      import.meta.dirname,
      "..",
      "eslint.config.ts",
    ),
    overrideConfig: {
      languageOptions: { parserOptions: { projectService: false } },
    },
    ruleFilter: ({ ruleId }) => ruleId === RULE_ID,
  });

  beforeAll(async () => {
    await linter.calculateConfigForFile("eslint.config.ts");
  }, CONFIG_LOAD_TIMEOUT_MS);

  it.each(cases)(
    "checks %s in %s",
    async (...[_name, filePath, count]: FilenameCase) => {
      const [result] = await linter.lintText("export {};", { filePath });

      expect.assert(result != null);
      expect(result.messages).toHaveLength(count);
      expect(result.messages.map(({ ruleId }) => ruleId)).toEqual(
        Array.from({ length: count }, () => RULE_ID),
      );
      expect(
        result.messages.every(
          ({ severity }) => severity === SEVERITY_LEVELS.Error,
        ),
      ).toBe(true);
    },
  );
});

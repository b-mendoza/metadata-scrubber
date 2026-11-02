import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { SEVERITY_LEVELS } from "./constants.ts";

const NO_DIAGNOSTICS = 0;
const THREE_DIAGNOSTICS = 3;
const ONE_DIAGNOSTIC = 1;

const CONFIG_LOAD_TIMEOUT_MS = 30_000;
const SYNTAX_RULE_IDS = new Set(["no-restricted-syntax"]);

type SyntaxCase = readonly [
  name: string,
  filePath: string,
  code: string,
  count: number,
];

const createLinter = () =>
  new ESLint({
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfigFile: path.join(
      import.meta.dirname,
      "..",
      "eslint.config.ts",
    ),
    overrideConfig: {
      languageOptions: { parserOptions: { projectService: false } },
    },
    ruleFilter: ({ ruleId }) => SYNTAX_RULE_IDS.has(ruleId),
  });

const cases: readonly SyntaxCase[] = [
  [
    "no-classes positive",
    "src/policy.mod.ts",
    "export const createService = () => ({ run: () => true });\n\nexport const createServiceError = (message: string, cause: unknown) =>\n  new Error(message, { cause });\n",
    NO_DIAGNOSTICS,
  ],
  [
    "no-classes negative",
    "src/policy.mod.ts",
    "export class Service {}\n\nexport const ServiceExpression = class {};\n\nexport class ServiceError extends Error {}\n",
    THREE_DIAGNOSTICS,
  ],
  [
    "global class scope",
    "eslint-config/constants.ts",
    "class Service {}",
    ONE_DIAGNOSTIC,
  ],
];

describe("effective syntax policies after the Oxlint bridge", () => {
  const linter = createLinter();

  beforeAll(async () => {
    await linter.calculateConfigForFile("eslint.config.ts");
  }, CONFIG_LOAD_TIMEOUT_MS);

  it.each(cases)(
    "preserves %s in %s",
    async (...[_name, filePath, code, count]: SyntaxCase) => {
      const [result] = await linter.lintText(code, { filePath });

      expect.assert(result != null);
      expect(result.messages).toHaveLength(count);
      expect(
        result.messages.every(
          ({ ruleId, severity }) =>
            ruleId != null &&
            SYNTAX_RULE_IDS.has(ruleId) &&
            severity === SEVERITY_LEVELS.Error,
        ),
      ).toBe(true);
    },
  );
});

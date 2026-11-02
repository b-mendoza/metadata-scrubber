import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { SEVERITY_LEVELS } from "./constants.ts";

const NO_DIAGNOSTICS = 0;
const ONE_DIAGNOSTIC = 1;
const CONFIG_LOAD_TIMEOUT_MS = 30_000;
const RULE_ID = "neverthrow/must-use-result";

type ResultCase = readonly [name: string, code: string, count: number];

const cases: readonly ResultCase[] = [
  [
    "a discarded isErr call",
    'import { ok } from "neverthrow"; ok("value").isErr();',
    ONE_DIAGNOSTIC,
  ],
  [
    "a discarded async isErr call",
    'import { ResultAsync } from "neverthrow"; const load = () => Promise.resolve("value"); void ResultAsync.fromSafePromise(load()).then((result) => result.isErr());',
    ONE_DIAGNOSTIC,
  ],
  [
    "a discarded ResultAsync",
    'import { ResultAsync } from "neverthrow"; ResultAsync.fromPromise(Promise.resolve("value"), (cause: unknown) => new Error(String(cause)));',
    ONE_DIAGNOSTIC,
  ],
  [
    "a stored but unchecked awaited result",
    'import { ResultAsync } from "neverthrow"; export const run = async () => { const result = await ResultAsync.fromPromise(Promise.resolve("value"), (cause: unknown) => new Error(String(cause))); };',
    ONE_DIAGNOSTIC,
  ],
  [
    "a discarded user-function result",
    'import { ok } from "neverthrow"; const operation = () => ok("value"); operation();',
    ONE_DIAGNOSTIC,
  ],
  [
    "the project isErr guard",
    'import { ResultAsync } from "neverthrow"; export const run = async () => { const result = await ResultAsync.fromPromise(Promise.resolve("value"), (cause: unknown) => new Error(String(cause))); if (result.isErr()) { throw result.error; } return result.value; };',
    NO_DIAGNOSTICS,
  ],
];

describe("neverthrow policy after the Oxlint bridge", () => {
  const linter = new ESLint({
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfigFile: path.join(
      import.meta.dirname,
      "..",
      "eslint.config.ts",
    ),
    ruleFilter: ({ ruleId }) => ruleId === RULE_ID,
  });

  beforeAll(async () => {
    await linter.calculateConfigForFile(import.meta.filename);
  }, CONFIG_LOAD_TIMEOUT_MS);

  it.each(cases)("checks %s", async (...[_name, code, count]: ResultCase) => {
    // This existing file belongs to tsconfig.node.json. Keep production type information.
    const [result] = await linter.lintText(code, {
      filePath: import.meta.filename,
    });

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
  });
});

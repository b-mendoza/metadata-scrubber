import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as z from "zod";

import { fixtureCases } from "./fixture-cases.ts";

const FAILURE_EXIT_CODE = 1;
const MISSING_JSON_START = -1;
const NO_DIAGNOSTICS = 0;
const NO_FILES = 0;
const SUCCESS_EXIT_CODE = 0;

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.join(pluginDirectory, "..");
const oxlintPath = path.join(
  frontendDirectory,
  "node_modules",
  ".bin",
  "oxlint",
);

// eslint-disable-next-line zod/prefer-string-schema-with-trim -- This third-party oxlint JSON boundary needs byte-for-byte strings. Trim would hide whitespace mismatches.
const oxlintJsonExactStringSchema = z.string();

const oxlintJsonMessageSchema = z.object({
  code: oxlintJsonExactStringSchema.nullish(),
  message: oxlintJsonExactStringSchema,
  ruleId: oxlintJsonExactStringSchema.nullish(),
});

const oxlintJsonResultSchema = z.object({
  diagnostics: z.array(oxlintJsonMessageSchema).nullish(),
  messages: z.array(oxlintJsonMessageSchema).nullish(),
  number_of_files: z.number().nullish(),
});

const oxlintJsonOutputSchema = z.union([
  oxlintJsonResultSchema,
  z.array(oxlintJsonResultSchema),
]);

type OxlintJsonMessage = z.infer<typeof oxlintJsonMessageSchema>;
type OxlintJsonOutput = z.infer<typeof oxlintJsonOutputSchema>;

const isRuleMessage = (message: OxlintJsonMessage, ruleId: string): boolean => {
  const target = `metadata-scrubber/${ruleId}`;
  return (
    message.ruleId === target ||
    message.code === target ||
    message.code === `metadata-scrubber(${ruleId})`
  );
};

const parseMessages = (
  parsed: OxlintJsonOutput,
): readonly OxlintJsonMessage[] =>
  Array.isArray(parsed)
    ? parsed.flatMap((result) => result.messages ?? result.diagnostics ?? [])
    : (parsed.messages ?? parsed.diagnostics ?? []);

interface FixtureLintResult {
  readonly stderr: string;
  readonly stdout: string;
  readonly status: typeof FAILURE_EXIT_CODE | typeof SUCCESS_EXIT_CODE;
}

const runFixtureLint = (fixturePath: string): FixtureLintResult => {
  const result = spawnSync(
    oxlintPath,
    [
      "-c",
      path.join("oxlint-plugin-metadata-scrubber", "fixture.config.json"),
      "--format",
      "json",
      "--disable-nested-config",
      fixturePath,
    ],
    {
      cwd: frontendDirectory,
      encoding: "utf-8",
    },
  );
  if (result.error != null) {
    throw new Error(
      `Oxlint could not start for ${fixturePath}: ${result.error.message}`,
    );
  }
  const { status, stderr, stdout } = result;
  if (status !== SUCCESS_EXIT_CODE && status !== FAILURE_EXIT_CODE) {
    throw new Error(
      `Oxlint failed for ${fixturePath} with exit code ${String(status)}. Stdout: ${stdout.trim()} Stderr: ${stderr.trim()}`,
    );
  }
  return { status, stderr, stdout };
};

const hasNoLintedFiles = (parsed: OxlintJsonOutput): boolean =>
  !Array.isArray(parsed) && parsed.number_of_files === NO_FILES;

const getJsonStart = (stdout: string): number => {
  const arrayStart = stdout.indexOf("[");
  const objectStart = stdout.indexOf("{");
  if (arrayStart === MISSING_JSON_START) return objectStart;
  if (objectStart === MISSING_JSON_START) return arrayStart;
  return Math.min(arrayStart, objectStart);
};

const getStderrSuffix = (stderr: string): string => {
  const details = stderr.trim();
  return details === "" ? "" : ` Stderr: ${details}`;
};

const parseFixtureJson = (
  fixturePath: string,
  stdout: string,
  options: { jsonStart: number; stderrSuffix: string },
): unknown => {
  const { jsonStart, stderrSuffix } = options;
  try {
    const parsedValue: unknown = JSON.parse(stdout.slice(jsonStart));
    return parsedValue;
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: malformed JSON in stdout. ${details}.${stderrSuffix}`,
      { cause: error },
    );
  }
};

const validateFixtureJson = (
  fixturePath: string,
  parsedValue: unknown,
  stderrSuffix: string,
): OxlintJsonOutput => {
  try {
    return oxlintJsonOutputSchema.parse(parsedValue);
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: ${details}${stderrSuffix}`,
      { cause: error },
    );
  }
};

const parseFixtureLintOutput = (
  fixturePath: string,
  result: FixtureLintResult,
): OxlintJsonOutput => {
  const jsonStart = getJsonStart(result.stdout);
  const stderrSuffix = getStderrSuffix(result.stderr);
  if (jsonStart === MISSING_JSON_START) {
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: stdout has no JSON object or array. Exit code: ${String(result.status)}. Stdout: ${result.stdout.trim()}.${stderrSuffix}`,
    );
  }
  const parsed = validateFixtureJson(
    fixturePath,
    parseFixtureJson(fixturePath, result.stdout, { jsonStart, stderrSuffix }),
    stderrSuffix,
  );
  if (hasNoLintedFiles(parsed)) {
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: number_of_files is 0.${stderrSuffix}`,
    );
  }
  return parsed;
};

const getDiagnosticMessages = (
  fixturePath: string,
  ruleId: string,
): readonly string[] => {
  const parsed = parseFixtureLintOutput(
    fixturePath,
    runFixtureLint(fixturePath),
  );
  return parseMessages(parsed)
    .filter((message) => isRuleMessage(message, ruleId))
    .map((message) => message.message);
};

let hasFailure = false;
for (const [ruleId, fixtureFile, expectedNegativeMessages] of fixtureCases) {
  const positivePath = path.join(
    "oxlint-plugin-metadata-scrubber",
    "fixtures",
    "positive",
    fixtureFile,
  );
  const negativePath = path.join(
    "oxlint-plugin-metadata-scrubber",
    "fixtures",
    "negative",
    fixtureFile,
  );
  const positiveMessages = getDiagnosticMessages(positivePath, ruleId);
  const negativeMessages = getDiagnosticMessages(negativePath, ruleId);
  if (positiveMessages.length !== NO_DIAGNOSTICS) {
    console.error(
      `${ruleId} positive ${fixtureFile}: expected 0, got ${String(positiveMessages.length)}`,
    );
    hasFailure = true;
  }
  if (negativeMessages.length !== expectedNegativeMessages.length) {
    console.error(
      `${ruleId} negative ${fixtureFile}: expected ${String(expectedNegativeMessages.length)}, got ${String(negativeMessages.length)}`,
    );
    hasFailure = true;
    continue;
  }
  for (const [index, expectedMessage] of expectedNegativeMessages.entries()) {
    const actualMessage = negativeMessages[index];
    if (actualMessage !== expectedMessage) {
      console.error(
        `${ruleId} negative ${fixtureFile} message ${String(index)}: expected ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(actualMessage)}`,
      );
      hasFailure = true;
    }
  }
}

if (hasFailure) process.exitCode = FAILURE_EXIT_CODE;

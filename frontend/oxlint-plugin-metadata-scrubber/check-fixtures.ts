import { spawnSync } from "node:child_process";
import path from "node:path";

import * as z from "zod";

import { fixtureCases } from "./fixture-cases.ts";

const FAILURE_EXIT_CODE = 1;
const NO_DIAGNOSTICS = 0;
const SUCCESS_EXIT_CODE = 0;

const pluginDirectory = import.meta.dirname;
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
});

const oxlintJsonOutputSchema = z.object({
  diagnostics: z.array(oxlintJsonMessageSchema),
  number_of_files: z.number().positive(),
});

const getDiagnosticMessages = (
  fixturePath: string,
  ruleId: string,
): readonly string[] => {
  // react-doctor-disable-next-line react-doctor/import-metadata-execution-risk -- Run local oxlint on trusted fixture paths to check lint rules.
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
  try {
    const parsedValue: unknown = JSON.parse(stdout);
    const parsed = oxlintJsonOutputSchema.parse(parsedValue);
    return parsed.diagnostics
      .filter((message) => message.code === `metadata-scrubber(${ruleId})`)
      .map((message) => message.message);
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: ${details}. Exit code: ${String(status)}. Stdout: ${stdout} Stderr: ${stderr}`,
      { cause: error },
    );
  }
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

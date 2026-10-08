import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import * as z from "zod";

import { fixtureCases } from "./fixture-cases.ts";

const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;

const pluginDirectory = import.meta.dirname;
const frontendDirectory = path.join(pluginDirectory, "..");
const oxlintPath = path.join(
  frontendDirectory,
  "node_modules",
  ".bin",
  "oxlint",
);

const oxlintJsonStringSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    error: "The diagnostic string must not start or end with whitespace.",
  })
  .trim();

const oxlintJsonMessageSchema = z.object({
  code: oxlintJsonStringSchema.nullish(),
  message: oxlintJsonStringSchema,
});

const oxlintJsonOutputSchema = z.object({
  diagnostics: z.array(oxlintJsonMessageSchema),
  number_of_files: z.number().positive(),
});

const getDiagnosticMessages = (
  fixturePath: string,
  ruleId: string,
): readonly string[] => {
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

for (const [ruleId, fixtureFile, expectedNegativeMessages] of fixtureCases) {
  void test(`${ruleId} ${fixtureFile}`, () => {
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
    assert.deepStrictEqual(positiveMessages, []);
    assert.deepStrictEqual(negativeMessages, expectedNegativeMessages);
  });
}

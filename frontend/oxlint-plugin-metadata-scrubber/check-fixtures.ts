import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";

import * as z from "zod";

import { fixtureCases } from "./fixture-cases.ts";

const EMPTY_MESSAGE_COUNT = 0;
const FILE_ORDER = new Intl.Collator("en");
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

// eslint-disable-next-line zod/prefer-string-schema-with-trim -- The .refine() check rejects padding, so .trim() cannot change an accepted value.
const oxlintJsonStringSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    error: "The diagnostic string must not start or end with whitespace.",
  });

const oxlintJsonMessageSchema = z.object({
  code: z.nullish(oxlintJsonStringSchema),
  message: oxlintJsonStringSchema,
  filename: oxlintJsonStringSchema,
});

const oxlintJsonOutputSchema = z.object({
  diagnostics: z.array(oxlintJsonMessageSchema),
  number_of_files: z.number().positive(),
});

const getDiagnosticMessages = (
  fixturePath: string,
  ruleId: string,
): readonly string[] => {
  const absoluteFixturePath = path.join(frontendDirectory, fixturePath);
  const isDirectory = statSync(absoluteFixturePath).isDirectory();
  const result = spawnSync(
    oxlintPath,
    [
      "-c",
      path.join(pluginDirectory, "fixture.config.json"),
      "--format",
      "json",
      "--disable-nested-config",
      isDirectory ? "." : fixturePath,
    ],
    {
      cwd: isDirectory ? absoluteFixturePath : frontendDirectory,
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
  const parsedValue: unknown = JSON.parse(stdout);
  const parsed = oxlintJsonOutputSchema.parse(parsedValue);
  const toolError = parsed.diagnostics.find((message) => message.code == null);
  if (toolError != null) {
    throw new Error(
      `Oxlint reported a parser or tool error for ${fixturePath}: ${toolError.message}`,
    );
  }
  return parsed.diagnostics
    .filter((message) => message.code === `metadata-scrubber(${ruleId})`)
    .toSorted((left, right) =>
      FILE_ORDER.compare(left.filename, right.filename),
    )
    .map((message) => message.message);
};

for (const [ruleId, fixtureFile, expectedNegativeMessages] of fixtureCases) {
  void test(`${ruleId} ${fixtureFile}`, (context: TestContext) => {
    const positivePath = path.join(
      "oxlint-plugin-metadata-scrubber",
      "fixtures",
      "positive",
      fixtureFile,
    );
    const positiveMessages = getDiagnosticMessages(positivePath, ruleId);
    context.assert.deepStrictEqual(positiveMessages, []);
    if (expectedNegativeMessages.length === EMPTY_MESSAGE_COUNT) return;
    const negativePath = path.join(
      "oxlint-plugin-metadata-scrubber",
      "fixtures",
      "negative",
      fixtureFile,
    );
    const negativeMessages = getDiagnosticMessages(negativePath, ruleId);
    context.assert.deepStrictEqual(negativeMessages, expectedNegativeMessages);
  });
}

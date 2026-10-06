import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";

import { ESLint, Linter } from "eslint";
import { errAsync, fromThrowable, ResultAsync } from "neverthrow";
import { parser } from "typescript-eslint";

const TOOL_DIRECTIVE = /^(?:eslint|oxlint|react-doctor)(?:-[\w\-]+)?(?:\s|$)/v;
const GLOBAL_DIRECTIVE = /^(?:exported|globals?)(?:\s|$)/v;
const NEXT_LINE_EXCEPTION =
  /^eslint-disable-next-line\s+[\w@][\w@\/.\-]*(?:\s*,\s*[\w@][\w@\/.\-]*)*\s+--\s+\S.*$/v;

export function checkLintDirectives(source: string, file: string) {
  const linter = new Linter();
  const messages = linter.verify(
    source,
    {
      files: ["**"],
      languageOptions: { parser },
    },
    { filename: file, allowInlineConfig: false },
  );
  const noParseErrors = 0;
  assert.equal(
    messages.length,
    noParseErrors,
    `${file}: Cannot inspect comments: ${JSON.stringify(messages)}`,
  );
  const failures: Array<{ line: number; message: string }> = [];
  const comments = linter.getSourceCode().getAllComments();
  for (const comment of comments) {
    const value = comment.value.trim();
    const isReactDoctorDirective = value.includes("react-doctor-disable");
    if (
      !isReactDoctorDirective &&
      !TOOL_DIRECTIVE.test(value) &&
      !GLOBAL_DIRECTIVE.test(value)
    ) {
      continue;
    }
    if (
      !isReactDoctorDirective &&
      comment.type === "Line" &&
      NEXT_LINE_EXCEPTION.test(value)
    ) {
      continue;
    }
    assert.ok(
      comment.loc != null,
      `${file}: The parser must supply a comment location.`,
    );
    const { line } = comment.loc.start;
    failures.push({
      line,
      message: `${file}:${String(line)}: Forbidden or incomplete lint directive. Use only // eslint-disable-next-line <rule ids> -- <reason>. Name each rule and give a non-empty reason so each exception is reviewable.`,
    });
  }
  return failures;
}

const FAILURE_EXIT_CODE = 1;

function createDirectiveESLint() {
  // ESLint owns file selection. Inline configuration cannot alter this guard.
  return new ESLint({
    allowInlineConfig: false,
    cwd: path.resolve(import.meta.dirname, ".."),
    ruleFilter: () => false,
  });
}

async function inspectFileDirectives(filePath: string) {
  const result = await ResultAsync.fromPromise(
    readFile(filePath, "utf-8"),
    (cause: unknown) =>
      new Error(`Could not read ${filePath} for lint directives.`, { cause }),
  ).andThen((source) =>
    fromThrowable(
      checkLintDirectives,
      (cause: unknown) =>
        new Error(`${filePath}: Could not inspect lint directives.`, { cause }),
    )(source, filePath),
  );
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function checkFilesForLintDirectives() {
  const eslintResult = fromThrowable(
    createDirectiveESLint,
    (cause: unknown) =>
      new Error("Could not set up the lint directive check.", { cause }),
  )();
  if (eslintResult.isErr()) {
    return errAsync(eslintResult.error);
  }
  return ResultAsync.fromPromise(
    eslintResult.value.lintFiles(["."]),
    (cause: unknown) =>
      new Error("ESLint could not select files for the lint directive check.", {
        cause,
      }),
  ).andThen((files) =>
    ResultAsync.fromPromise(
      Promise.all(
        files.map(async ({ filePath }) => inspectFileDirectives(filePath)),
      ),
      (cause: unknown) =>
        new Error("Could not check files for lint directives.", { cause }),
    ).map((results) => {
      for (const { message } of results.flat()) {
        process.stderr.write(`${message}\n`);
        process.exitCode = FAILURE_EXIT_CODE;
      }
      process.stdout.write(
        `Checked ${String(files.length)} files for lint directives.\n`,
      );
      return null;
    }),
  );
}

if (import.meta.main) {
  const result = await checkFilesForLintDirectives();
  if (result.isErr()) {
    process.stderr.write(`${inspect(result.error)}\n`);
    process.exitCode = FAILURE_EXIT_CODE;
  }
}

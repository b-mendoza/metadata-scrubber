import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ESLint, Linter } from "eslint";
import { parser } from "typescript-eslint";

const TOOL_DIRECTIVE = /^(?:eslint|oxlint|react-doctor)(?:-[\w\-]+)?(?:\s|$)/v;
const GLOBAL_DIRECTIVE = /^(?:exported|globals?)(?:\s|$)/v;
const NEXT_LINE_EXCEPTION =
  /^(?:eslint|react-doctor)-disable-next-line\s+[\w@][\w@\/.\-]*(?:\s*,\s*[\w@][\w@\/.\-]*)*\s+--\s+\S.*$/v;

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
    if (!TOOL_DIRECTIVE.test(value) && !GLOBAL_DIRECTIVE.test(value)) {
      continue;
    }
    if (comment.type === "Line" && NEXT_LINE_EXCEPTION.test(value)) {
      continue;
    }
    assert.ok(
      comment.loc != null,
      `${file}: The parser must supply a comment location.`,
    );
    const { line } = comment.loc.start;
    failures.push({
      line,
      message: `${file}:${String(line)}: Forbidden or incomplete lint directive. Use only // eslint-disable-next-line <rule ids> -- <reason> or // react-doctor-disable-next-line <rule ids> -- <reason>. Name each rule and give a non-empty reason so each exception is reviewable.`,
    });
  }
  return failures;
}

if (import.meta.main) {
  // ESLint owns file selection. Inline configuration cannot alter this guard.
  const eslint = new ESLint({
    allowInlineConfig: false,
    cwd: path.resolve(import.meta.dirname, ".."),
    ruleFilter: () => false,
  });
  const files = await eslint.lintFiles(["."]);
  const results = await Promise.all(
    files.map(async ({ filePath }) => {
      const source = await readFile(filePath, "utf-8");
      return checkLintDirectives(source, filePath);
    }),
  );
  for (const { message } of results.flat()) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
  process.stdout.write(
    `Checked ${String(files.length)} files for lint directives.\n`,
  );
}

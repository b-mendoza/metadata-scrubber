import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspect, parseArgs } from "node:util";

import { ESLint } from "eslint";
import * as z from "zod";

import config from "../eslint.config.js";

const samples = {
  "src .ts": "src/shared/constants/http/status-codes/status-codes.mod.ts",
  "src .tsx": "src/shared/libs/trpc/client/client.mod.tsx",
  "src test .ts": "src/domains/products/products-router.mod.server.test.ts",
  "src test .tsx":
    "src/domains/wizard/components/file-uploader/file-uploader-upload-success.mod.test.tsx",
  "eslint.config.js": "eslint.config.js",
  "eslint-config .js": "eslint-config/test-rules.js",
  "scripts .ts": "scripts/check-lint-directives.ts",
  "scripts test .ts": "scripts/check-lint-directives.test.ts",
  "vite.config.ts": "vite.config.ts",
  "oxlint plugin .ts": "oxlint-plugin-metadata-scrubber/index.ts",
};
const root = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(import.meta.dirname, "lint-policy.snapshot");
const collator = new Intl.Collator("en");
const rulesSchema = z.record(z.string(), z.array(z.unknown()));
const snapshotSchema = z.record(
  z.string(),
  z.record(z.string(), z.string().trim()),
);
const { values } = parseArgs({
  options: { update: { type: "boolean", default: false } },
});
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: config.filter(
    (entry) => entry.name?.startsWith("oxlint/") !== true,
  ),
});
const scopes = await Promise.all(
  Object.entries(samples).map(async ([scope, file]) => {
    const filename = path.join(root, file);
    const resolvedConfig: Promise<unknown> =
      eslint.calculateConfigForFile(filename);
    const [metadata, ignored, resolved] = await Promise.all([
      stat(filename),
      eslint.isPathIgnored(filename),
      resolvedConfig,
    ]);
    assert.ok(metadata.isFile(), `${file}: Policy sample must be a real file.`);
    assert.equal(ignored, false, `${file}: Policy sample must not be ignored.`);
    const { rules } = z.object({ rules: rulesSchema }).parse(resolved);
    // inspect preserves Infinity in resolved defaults instead of turning it into null.
    const entries = Object.entries(rules).map(
      ([rule, options]) =>
        [
          rule,
          inspect(options, {
            breakLength: Infinity,
            compact: true,
            depth: null,
            maxArrayLength: null,
            maxStringLength: null,
            sorted: true,
          }),
        ] as const,
    );
    return [`${scope}: ${file}`, Object.fromEntries(entries)] as const;
  }),
);
const current = Object.fromEntries(scopes);

if (values.update) {
  const groups = scopes.map(([scope, rules]) => {
    const lines = Object.keys(rules)
      .toSorted(collator.compare)
      .map(
        (rule) => `    ${JSON.stringify(rule)}: ${JSON.stringify(rules[rule])}`,
      );
    return `  ${JSON.stringify(scope)}: {\n${lines.join(",\n")}\n  }`;
  });
  await writeFile(snapshotPath, `{\n${groups.join(",\n")}\n}\n`, "utf-8");
  process.stdout.write(
    `Updated ${snapshotPath}. Review each rule-set change before you accept this snapshot.\n`,
  );
} else {
  const previous = snapshotSchema.parse(
    JSON.parse(await readFile(snapshotPath, "utf-8")),
  );
  const scopeNames = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ]);
  for (const scope of scopeNames) {
    const before = previous[scope] ?? {};
    const after = current[scope] ?? {};
    const ruleNames = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].toSorted(collator.compare);
    for (const rule of ruleNames) {
      const oldValue = before[rule] ?? "absent";
      const newValue = after[rule] ?? "absent";
      if (oldValue !== newValue) {
        const change = before[rule] == null ? "added" : "changed";
        const kind = after[rule] == null ? "removed" : change;
        process.stderr.write(
          `[${scope}] ${kind} ${rule}: ${oldValue} -> ${newValue}\n`,
        );
        process.exitCode = 1;
      }
    }
  }
  if (process.exitCode == null) {
    process.stdout.write(
      `ESLint policy matches ${String(scopes.length)} scopes.\n`,
    );
  } else {
    process.stderr.write(
      "The ESLint rule set changed. Review each policy change. Update the snapshot deliberately with pnpm run policy:update after review.\n",
    );
  }
}

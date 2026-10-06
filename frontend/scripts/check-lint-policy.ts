import assert from "node:assert/strict";
import type { Stats } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspect, parseArgs } from "node:util";

import { ESLint } from "eslint";
import { errAsync, fromThrowable, ok, ResultAsync } from "neverthrow";
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
const FAILURE_EXIT_CODE = 1;
const root = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(import.meta.dirname, "lint-policy.snapshot");
const collator = new Intl.Collator("en");
const rulesSchema = z.record(z.string(), z.array(z.unknown()));
const snapshotSchema = z.record(
  z.string(),
  z.record(z.string(), z.string().trim()),
);
const policyConfig = config.filter(
  (entry) => entry.name?.startsWith("oxlint/") !== true,
);

type PolicyScope = readonly [string, Record<string, string>];

function createPolicyInputs() {
  const { values } = parseArgs({
    options: { update: { type: "boolean", default: false } },
  });
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: policyConfig,
  });
  return { values, eslint };
}

function inspectRule([rule, options]: [string, unknown[]]) {
  // inspect preserves Infinity in resolved defaults instead of turning it into null.
  return [
    rule,
    inspect(options, {
      breakLength: Infinity,
      compact: true,
      depth: null,
      maxArrayLength: null,
      maxStringLength: null,
      sorted: true,
    }),
  ] as const;
}

function validatePolicySample(
  scope: string,
  file: string,
  {
    metadata,
    ignored,
    resolved,
  }: {
    metadata: Stats;
    ignored: boolean;
    resolved: unknown;
  },
) {
  assert.ok(metadata.isFile(), `${file}: Policy sample must be a real file.`);
  assert.equal(ignored, false, `${file}: Policy sample must not be ignored.`);
  const { rules } = z.object({ rules: rulesSchema }).parse(resolved);
  const entries = Object.entries(rules).map(([rule, options]) =>
    inspectRule([rule, options]),
  );
  return [`${scope}: ${file}`, Object.fromEntries(entries)] as const;
}

async function resolveScope(scope: string, file: string, eslint: ESLint) {
  const filename = path.join(root, file);
  const resolvedConfig: Promise<unknown> =
    eslint.calculateConfigForFile(filename);
  const dependenciesResult = await ResultAsync.fromPromise(
    Promise.all([
      stat(filename),
      eslint.isPathIgnored(filename),
      resolvedConfig,
    ]),
    (cause: unknown) =>
      new Error(`${file}: Could not resolve the ESLint policy sample.`, {
        cause,
      }),
  );
  if (dependenciesResult.isErr()) {
    throw dependenciesResult.error;
  }
  const [metadata, ignored, resolved] = dependenciesResult.value;
  const result = fromThrowable(
    validatePolicySample,
    (cause: unknown) =>
      new Error(`${file}: Could not validate the ESLint policy sample.`, {
        cause,
      }),
  )(scope, file, { metadata, ignored, resolved });
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function updatePolicySnapshot(scopes: readonly PolicyScope[]) {
  const groups = scopes.map(([scope, rules]) => {
    const lines = Object.keys(rules)
      .toSorted(collator.compare)
      .map(
        (rule) => `    ${JSON.stringify(rule)}: ${JSON.stringify(rules[rule])}`,
      );
    return `  ${JSON.stringify(scope)}: {\n${lines.join(",\n")}\n  }`;
  });
  return ResultAsync.fromPromise(
    writeFile(snapshotPath, `{\n${groups.join(",\n")}\n}\n`, "utf-8"),
    (cause: unknown) =>
      new Error(`Could not write the ESLint policy snapshot ${snapshotPath}.`, {
        cause,
      }),
  ).map(() => {
    process.stdout.write(
      `Updated ${snapshotPath}. Review each rule-set change before you accept this snapshot.\n`,
    );
    return null;
  });
}

function parseSnapshot(source: string) {
  const parsedValue: unknown = JSON.parse(source);
  return snapshotSchema.parse(parsedValue);
}

function reportScopeChanges(
  scope: string,
  before: Record<string, string>,
  after: Record<string, string>,
) {
  const ruleNames = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].toSorted(collator.compare);
  for (const rule of ruleNames) {
    const oldValue = before[rule] ?? "absent";
    const newValue = after[rule] ?? "absent";
    if (oldValue === newValue) {
      continue;
    }
    const change = before[rule] == null ? "added" : "changed";
    const kind = after[rule] == null ? "removed" : change;
    process.stderr.write(
      `[${scope}] ${kind} ${rule}: ${oldValue} -> ${newValue}\n`,
    );
    process.exitCode = FAILURE_EXIT_CODE;
  }
}

async function checkPolicySnapshot(scopes: readonly PolicyScope[]) {
  const current = Object.fromEntries(scopes);
  const previousResult = await ResultAsync.fromPromise(
    readFile(snapshotPath, "utf-8"),
    (cause: unknown) =>
      new Error(`Could not read the ESLint policy snapshot ${snapshotPath}.`, {
        cause,
      }),
  ).andThen(
    fromThrowable(
      parseSnapshot,
      (cause: unknown) =>
        new Error(
          `Could not parse the ESLint policy snapshot ${snapshotPath}.`,
          {
            cause,
          },
        ),
    ),
  );
  if (previousResult.isErr()) {
    return previousResult;
  }
  const previous = previousResult.value;
  const scopeNames = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ]);
  for (const scope of scopeNames) {
    reportScopeChanges(scope, previous[scope] ?? {}, current[scope] ?? {});
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
  return ok(null);
}

function checkLintPolicy() {
  const inputsResult = fromThrowable(
    createPolicyInputs,
    (cause: unknown) =>
      new Error("Could not set up the ESLint policy check.", { cause }),
  )();
  if (inputsResult.isErr()) {
    return errAsync(inputsResult.error);
  }
  const { values, eslint } = inputsResult.value;
  return ResultAsync.fromPromise(
    Promise.all(
      Object.entries(samples).map(async ([scope, file]) =>
        resolveScope(scope, file, eslint),
      ),
    ),
    (cause: unknown) =>
      new Error("Could not complete the ESLint policy check.", { cause }),
  ).andThen((scopes) => {
    if (values.update) {
      return updatePolicySnapshot(scopes);
    }
    return ResultAsync.fromPromise(
      checkPolicySnapshot(scopes),
      (cause: unknown) =>
        new Error("Could not complete the ESLint policy check.", { cause }),
    ).andThen((result) => result);
  });
}

const result = await checkLintPolicy();
if (result.isErr()) {
  process.stderr.write(`${inspect(result.error)}\n`);
  process.exitCode = FAILURE_EXIT_CODE;
}

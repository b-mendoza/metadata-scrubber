import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type FixtureCase = readonly [
  ruleId: string,
  fixtureFile: string,
  expectedNegativeCount: number,
];

const cases = [
  ["hoist-effect-schema-compilers", "schema-compiler.server.ts", 1],
  ["no-classes", "no-classes.ts", 2],
  ["no-expect-type-of", "no-expect-type-of.test.ts", 1],
  ["no-hardcoded-backend-host", "no-hardcoded-backend-host.ts", 1],
  [
    "no-mutable-module-state-in-server-code",
    "mutable-module-state.server.ts",
    1,
  ],
  ["no-silent-test-prerequisite", "no-silent-test-prerequisite.test.ts", 2],
  ["schema-import-boundaries", "schema-boundary.server.ts", 1],
  ["schema-import-boundaries", "schema-boundary.browser.ts", 1],
  ["schema-import-boundaries", "schema-boundary.shared.ts", 1],
  ["use-shared-render-helper", "use-shared-render-helper.test.tsx", 1],
] as const satisfies readonly FixtureCase[];

const pluginDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(pluginDir, "..");
const oxlintPath = join(frontendDir, "node_modules", ".bin", "oxlint");
const ruleName = (ruleId: string): string => `metadata-scrubber/${ruleId}`;

interface OxlintJsonMessage {
  readonly code?: string;
  readonly ruleId?: string;
}

interface OxlintJsonResult {
  readonly diagnostics?: readonly OxlintJsonMessage[];
  readonly messages?: readonly OxlintJsonMessage[];
}

const messageMatchesRule = (
  message: OxlintJsonMessage,
  ruleId: string,
): boolean => {
  const target = ruleName(ruleId);
  return (
    message.ruleId === target ||
    message.code === target ||
    message.code === `metadata-scrubber(${ruleId})`
  );
};

const parseMessages = (stdout: string): readonly OxlintJsonMessage[] => {
  const trimmed = stdout.trim();
  if (trimmed === "") return [];
  const parsed: unknown = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return [];
      const record = entry as OxlintJsonResult;
      return record.messages ?? record.diagnostics ?? [];
    });
  }
  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as OxlintJsonResult;
    return record.messages ?? record.diagnostics ?? [];
  }
  return [];
};

const countDiagnostics = (fixturePath: string, ruleId: string): number => {
  const result = spawnSync(
    oxlintPath,
    [
      "-c",
      join("oxlint-plugin-metadata-scrubber", "fixture.config.json"),
      "--format",
      "json",
      "--disable-nested-config",
      fixturePath,
    ],
    {
      cwd: frontendDir,
      encoding: "utf8",
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  const jsonStart = output.includes("{")
    ? output.indexOf("{")
    : output.indexOf("[");
  const jsonText = jsonStart === -1 ? "[]" : output.slice(jsonStart);
  return parseMessages(jsonText).filter((message) =>
    messageMatchesRule(message, ruleId),
  ).length;
};

let hasFailure = false;
for (const [ruleId, fixtureFile, expectedNegativeCount] of cases) {
  const positivePath = join(
    "oxlint-plugin-metadata-scrubber",
    "fixtures",
    "positive",
    fixtureFile,
  );
  const negativePath = join(
    "oxlint-plugin-metadata-scrubber",
    "fixtures",
    "negative",
    fixtureFile,
  );
  const positiveCount = countDiagnostics(positivePath, ruleId);
  const negativeCount = countDiagnostics(negativePath, ruleId);
  if (positiveCount !== 0) {
    console.error(
      `${ruleId} positive ${fixtureFile}: expected 0, got ${String(positiveCount)}`,
    );
    hasFailure = true;
  }
  if (negativeCount !== expectedNegativeCount) {
    console.error(
      `${ruleId} negative ${fixtureFile}: expected ${String(expectedNegativeCount)}, got ${String(negativeCount)}`,
    );
    hasFailure = true;
  }
}

if (hasFailure) process.exitCode = 1;

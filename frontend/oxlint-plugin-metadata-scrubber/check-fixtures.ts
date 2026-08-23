import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as z from "zod";

type FixtureCase = readonly [
  ruleId: string,
  fixtureFile: string,
  expectedNegativeMessages: readonly string[],
];

const FAILURE_EXIT_CODE = 1;
const INSECURE_HTTP_PROTOCOL = "http";
const MISSING_JSON_START = -1;
const NO_DIAGNOSTICS = 0;
const NO_FILES = 0;
const SUCCESS_EXIT_CODE = 0;

const cases = [
  [
    "no-classes",
    "no-classes.ts",
    [
      "`Service` is an application class. Replace it with plain functions and objects, for example a factory function such as `const createService = () => ({ run: () => true })`. Plain functions and objects keep dependencies and mutable state explicit. The only allowed class exception is a class that extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on the `Data` namespace imported from the `effect` package.",
      "`ServiceExpression` is an application class. Replace it with plain functions and objects, for example a factory function such as `const createService = () => ({ run: () => true })`. Plain functions and objects keep dependencies and mutable state explicit. The only allowed class exception is a class that extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on the `Data` namespace imported from the `effect` package.",
      "`LocalTaggedFailure` is an application class. Replace it with plain functions and objects, for example a factory function such as `const createService = () => ({ run: () => true })`. Plain functions and objects keep dependencies and mutable state explicit. The only allowed class exception is a class that extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on the `Data` namespace imported from the `effect` package.",
      "`SchemaRecord` is an application class. Replace it with plain functions and objects, for example a factory function such as `const createService = () => ({ run: () => true })`. Plain functions and objects keep dependencies and mutable state explicit. The only allowed class exception is a class that extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on the `Data` namespace imported from the `effect` package.",
    ],
  ],
  [
    "no-expect-type-of",
    "no-expect-type-of.test.ts",
    [
      "`expectTypeOf(...)` tests a static type. Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.",
      "`assertType(...)` tests a static type. Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.",
    ],
  ],
  [
    "no-expect-type-of",
    "no-expect-type-of-global.test.ts",
    [
      "`expectTypeOf(...)` tests a static type. Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.",
    ],
  ],
  [
    "no-hardcoded-backend-host",
    "no-hardcoded-backend-host.ts",
    [
      "`https://backend.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      `\`${INSECURE_HTTP_PROTOCOL}://template.example.com\` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read \`env.BACKEND_URL\` through \`getApplicationBindings()\` and build \`new URL(path, env.BACKEND_URL)\`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.`,
      "`http://localhost:8787/\\unicode` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://payments.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`http://localhost:8787/` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`HTTP://service.example/path` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://backend.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      `\`${INSECURE_HTTP_PROTOCOL}://backend.example.com\` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read \`env.BACKEND_URL\` through \`getApplicationBindings()\` and build \`new URL(path, env.BACKEND_URL)\`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.`,
      "`https://backend.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://backend.example.com/api` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://as-expression.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://satisfies-expression.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
      "`https://non-null-expression.example.com` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
    ],
  ],
  [
    "no-mutable-module-state-in-server-code",
    "mutable-module-state.server.ts",
    [
      "Concurrent server requests share the module-scope `let` state in `requestCount`. Move request-local mutation into request scope. Put request dependencies in `applicationBindingsMiddleware` and read them with `getApplicationBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.",
    ],
  ],
  [
    "no-silent-test-prerequisite",
    "no-silent-test-prerequisite.test.ts",
    [
      "`test.skip` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "`test.skip` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "`check.skip` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "`describe.skip` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "`it.skip` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "`test.skip.each([false])` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      "The `!ready` test prerequisite guard uses a bare `return` in `test.each([false])`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect(ready).toBeTruthy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
      "The `value === undefined` test prerequisite guard uses a bare `return` in `test`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect((value === undefined)).toBeFalsy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
      "The `blocked` test prerequisite guard uses a bare `return` in `test`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect((blocked)).toBeFalsy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
      "The `prepare(), blocked` test prerequisite guard uses a bare `return` in `test`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect((prepare(), blocked)).toBeFalsy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
    ],
  ],
  [
    "use-shared-render-helper",
    "use-shared-render-helper.test.tsx",
    [
      "Do not use `render` from the `@testing-library/react` package directly. Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.",
      "Do not use `renderAgain` from the `@testing-library/react` package directly. Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.",
      "Do not use `pureRender` from the `@testing-library/react/pure` package directly. Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.",
      "Do not use `testingLibrary.render` from the `@testing-library/react` package directly. Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.",
    ],
  ],
] as const satisfies readonly FixtureCase[];

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.join(pluginDirectory, "..");
const oxlintPath = path.join(
  frontendDirectory,
  "node_modules",
  ".bin",
  "oxlint",
);
const ruleName = (ruleId: string): string => `metadata-scrubber/${ruleId}`;

// eslint-disable-next-line zod/prefer-string-schema-with-trim -- Fixture checks compare oxlint diagnostic messages byte-for-byte. The `.trim()` transform would silently alter values and hide whitespace mismatches, so this boundary must return each string unchanged.
const oxlintJsonStringSchema = z.string();

const oxlintJsonMessageSchema = z.object({
  code: oxlintJsonStringSchema.nullish(),
  message: oxlintJsonStringSchema,
  ruleId: oxlintJsonStringSchema.nullish(),
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
      encoding: "utf8",
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

const getErrorDetails = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: malformed JSON in stdout. ${getErrorDetails(error)}.${stderrSuffix}`,
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
    throw new Error(
      `Oxlint JSON boundary failed for ${fixturePath}: ${getErrorDetails(error)}${stderrSuffix}`,
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
    .filter((message) => messageMatchesRule(message, ruleId))
    .map((message) => message.message);
};

let hasFailure = false;
for (const [ruleId, fixtureFile, expectedNegativeMessages] of cases) {
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
    if (actualMessage === expectedMessage) continue;
    console.error(
      `${ruleId} negative ${fixtureFile} message ${String(index)}: expected ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(actualMessage)}`,
    );
    hasFailure = true;
  }
}

if (hasFailure) process.exitCode = FAILURE_EXIT_CODE;

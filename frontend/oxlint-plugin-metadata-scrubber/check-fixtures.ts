import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import * as z from "zod";

type FixtureCase = readonly [
  ruleId: string,
  fixtureFile: string,
  expectedNegativeMessages: readonly string[],
];

const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const INSECURE_HTTP_PROTOCOL = "http";

const NO_CLASSES_GUIDANCE =
  "Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. Plain functions and objects keep dependencies and mutable state explicit. The rule has no class exceptions, including classes that extend `Error`.";
const NO_EXPECT_TYPE_OF_GUIDANCE =
  "Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.";
const NO_HARDCODED_BACKEND_HOST_GUIDANCE =
  "Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getAppBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.";
const NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE =
  "Move request-local mutation into request scope. Put request dependencies in `appBindingsMiddleware` and read them with `getAppBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.";
const NO_SILENT_TEST_PREREQUISITE_GUIDANCE =
  "Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.";
const SEPARATE_TYPE_IMPORTS_GUIDANCE =
  'Preserve each imported name and local alias. Keep runtime bindings in a separate import declaration. Type imports disappear from JavaScript. If no runtime import remains, keep a side-effect import when module initialization is required. Ky example: `import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";` and `import ky, { HTTPError } from "ky";`.';
const USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE =
  "Effects synchronize with external systems. Calculate derived values during render and handle user actions in event handlers. If external synchronization is necessary, put its setup and cleanup in a purpose-named hook such as `useUppyInstance`. Do not hide it in `useMount` or `useUnmount`. Read https://react.dev/learn/you-might-not-need-an-effect.";
const USE_SHARED_RENDER_HELPER_GUIDANCE =
  "Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.";

const fixtureCases: readonly FixtureCase[] = [
  [
    "no-classes",
    "no-classes.ts",
    [
      `\`Service\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
      `\`ServiceExpression\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
      `\`ServiceError\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
    ],
  ],
  [
    "no-expect-type-of",
    "no-expect-type-of.test.ts",
    [
      `\`assertType(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
      `\`expectTypeOf(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
    ],
  ],
  [
    "no-hardcoded-backend-host",
    "no-hardcoded-backend-host.ts",
    [
      `\`https://backend.example.com\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`${INSECURE_HTTP_PROTOCOL}://template.example.com\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`http://localhost:8787/\\unicode\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`http://localhost:8787/\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`HTTP://service.example/path\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`https://backend.example.com\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`${INSECURE_HTTP_PROTOCOL}://backend.example.com\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`https://backend.example.com/api\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
      `\`https://backend.example.com\` contains a static HTTP service host. ${NO_HARDCODED_BACKEND_HOST_GUIDANCE}`,
    ],
  ],
  [
    "no-mutable-module-state-in-server-code",
    "mutable-module-state.server.ts",
    [
      `Concurrent server requests share the module-scope \`let\` state in \`requestCount\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
      `Concurrent server requests share the module-scope \`var\` state in \`requestTotal, requestLabel\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
    ],
  ],
  [
    "no-silent-test-prerequisite",
    "no-silent-test-prerequisite.test.ts",
    [
      `\`check.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`describe.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`it.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`test.skip.each([false])\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      "The `!ready` test prerequisite guard uses a bare `return` in `test.each([false])`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect(ready).toBeTruthy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
      "The `value === undefined` test prerequisite guard uses a bare `return` in `test`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect((value === undefined)).toBeFalsy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
    ],
  ],
  [
    "separate-type-imports",
    "separate-type-imports.ts",
    [
      `Move inline type bindings \`KyInstance, RetryOptions, ShouldRetryState\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
      `Move inline type bindings \`KyInstance as Client\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
      `Move inline type bindings \`KyInstance as AllInlineClient, RetryOptions as AllInlineRetryOptions\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
    ],
  ],
  [
    "use-effect-in-custom-hook",
    "use-effect-in-custom-hook.tsx",
    [
      `React \`useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`declarationEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`lowercaseEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`React.useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`ReactNamespace["useEffect"]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`FinalNamespace[\`useEffect\`]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`assertedEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`savedEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`passedEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`SavedNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`DestructuredNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`ComputedNamespace["useEffect"]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`TemplateNamespace[\`useEffect\`]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`typeParameterEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`TypeShadowChain.useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`WrappedLiteralNamespace["useEffect" as const]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`WrappedTemplateNamespace[\`useEffect\` satisfies string]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`WrappedAssignmentNamespace[\`useEffect\` as const]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`SourceAndTargetNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`DefaultReadNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`ObjectReadNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`OrAssignmentNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`switchDiscriminantEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`shortNameEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`wrappedOwnerEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`callbackEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`propEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
    ],
  ],
  [
    "use-shared-render-helper",
    "use-shared-render-helper.test.tsx",
    [
      `Do not use \`render\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`renderAgain\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`pureRender\` from the \`@testing-library/react/pure\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`testingLibrary.render\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
    ],
  ],
];

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
  const parsedValue: unknown = JSON.parse(stdout);
  const parsed = oxlintJsonOutputSchema.parse(parsedValue);
  return parsed.diagnostics
    .filter((message) => message.code === `metadata-scrubber(${ruleId})`)
    .map((message) => message.message);
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

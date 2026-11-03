import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

const NO_DIAGNOSTICS = 0;
const THREE_DIAGNOSTICS = 3;
const LIFECYCLE_DIAGNOSTICS = 14;
const TWO_DIAGNOSTICS = 2;
const ONE_DIAGNOSTIC = 1;

const CONFIG_LOAD_TIMEOUT_MS = 30_000;
const SYNTAX_RULE_IDS = new Set([
  "no-restricted-syntax",
  `${PLUGIN_NAMES.CorePolicy}/server-try-catch`,
  `${PLUGIN_NAMES.CorePolicy}/test-instanceof-assertion`,
  `${PLUGIN_NAMES.CorePolicy}/rule-contract`,
  `${PLUGIN_NAMES.CorePolicy}/server-module-state`,
  `${PLUGIN_NAMES.CorePolicy}/test-object-type`,
  `${PLUGIN_NAMES.CorePolicy}/module-file-name`,
  `${PLUGIN_NAMES.CorePolicy}/module-jsx`,
]);

type SyntaxCase = readonly [
  name: string,
  filePath: string,
  code: string,
  count: number,
];

const createLinter = () =>
  new ESLint({
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfigFile: path.join(
      import.meta.dirname,
      "..",
      "eslint.config.ts",
    ),
    overrideConfig: {
      languageOptions: { parserOptions: { projectService: false } },
    },
    ruleFilter: ({ ruleId }) => SYNTAX_RULE_IDS.has(ruleId),
  });

const cases: readonly SyntaxCase[] = [
  [
    "TSX server scope",
    "src/state.mod.server.tsx",
    "let value = 0;",
    TWO_DIAGNOSTICS,
  ],

  [
    "tooling test network restriction",
    "e2e/policy.test.ts",
    "page.route('/api', handler); interface Body {}",
    TWO_DIAGNOSTICS,
  ],
  [
    "tooling test rule contract",
    "oxlint-plugin-metadata-scrubber/rules/policy.test.ts",
    "export default {}; interface Body {}",
    TWO_DIAGNOSTICS,
  ],

  [
    "no-classes positive",
    "src/policy.mod.ts",
    "export const createService = () => ({ run: () => true });\n\nexport const createServiceError = (message: string, cause: unknown) =>\n  new Error(message, { cause });\n",
    NO_DIAGNOSTICS,
  ],
  [
    "no-classes negative",
    "src/policy.mod.ts",
    "export class Service {}\n\nexport const ServiceExpression = class {};\n\nexport class ServiceError extends Error {}\n",
    THREE_DIAGNOSTICS,
  ],
  [
    "no-lifecycle-hook-names positive",
    "src/policy.mod.ts",
    'export function useUppyDashboard() {}\nexport const useUploadProgress = () => {};\nexport const useMountedState = function () {};\nexport function useInitialValue() {}\nexport const useMount = "an event name, not a hook";\n',
    NO_DIAGNOSTICS,
  ],
  [
    "no-lifecycle-hook-names negative",
    "src/policy.mod.ts",
    "export function useMount() {}\nexport const useOnMount = () => {};\nexport const useUnmount = function () {};\nexport function useOnUnmount() {}\nexport const useDidMount = () => {};\nexport const useWillUnmount = function () {};\nexport const useEffectOnce = () => {};\nexport const useOnce = function () {};\nexport function useInit() {}\nexport const useInitialize = () => {};\nexport const useFirstRender = function () {};\n\nexport function useMountUploader() {}\nexport const useMount2 = () => {};\nexport const useMount_uploader = () => {};\n",
    LIFECYCLE_DIAGNOSTICS,
  ],
  [
    "no-mutable-module-state-in-server-code positive",
    "src/policy.mod.server.ts",
    "export const requestCount = 0;\n\nexport const handleRequest = () => {\n  let localCount = 0;\n  localCount += 1;\n  return localCount;\n};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "no-mutable-module-state-in-server-code negative",
    "src/policy.mod.server.ts",
    'export let requestCount = 0;\n\nvar requestTotal = 0,\n  requestLabel = "request";\nexport { requestTotal, requestLabel };\n',
    TWO_DIAGNOSTICS,
  ],
  [
    "no-test-local-object-type positive",
    "src/policy.mod.test.ts",
    'import type { ZodString as Inputs } from "zod";\nimport type * as contracts from "zod";\n\nexport type CreateUpload = (input: contracts.output<Inputs>) => void;\nexport type Upload = contracts.output<Inputs>;\n',
    NO_DIAGNOSTICS,
  ],
  [
    "no-test-local-object-type negative",
    "src/policy.mod.test.ts",
    "export type Upload = { storageKey: string };\nexport interface ResponseBody {\n  status: string;\n}\n",
    TWO_DIAGNOSTICS,
  ],
  ["module filename positive", "outside.ts", "export {};\n", NO_DIAGNOSTICS],
  [
    "module JSX positive",
    "src/fragment.mod.tsx",
    "export const fragment = <>text</>;\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/plain.mod.server.test.ts",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/plain.mod.server.ts",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/plain.mod.test.ts",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/plain.mod.test.tsx",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/plain.mod.ts",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/router.tsx",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename positive",
    "src/routes/index.tsx",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  ["module filename positive", "src/start.ts", "export {};\n", NO_DIAGNOSTICS],
  [
    "module filename positive",
    "src/tests/setup-test-environment.ts",
    "export {};\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module JSX positive",
    "src/view.mod.tsx",
    "export const view = <div />;\n",
    NO_DIAGNOSTICS,
  ],
  [
    "module filename negative",
    "src/a-plain.ts",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module JSX negative",
    "src/b-empty.mod.tsx",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module filename negative",
    "src/c-server.mod.server.tsx",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module filename negative",
    "src/d-test.mod.test.server.ts",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module filename negative",
    "src/nested/router.tsx",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module filename negative",
    "src/tests/other-setup.ts",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "module filename negative",
    "src/tests/utils/helper.ts",
    "export {};\n",
    ONE_DIAGNOSTIC,
  ],
  [
    "global class scope",
    "eslint-config/constants.ts",
    "class Service {}",
    ONE_DIAGNOSTIC,
  ],
  [
    "global lifecycle scope",
    "eslint-config/constants.ts",
    "const useMount = () => {};",
    ONE_DIAGNOSTIC,
  ],
  [
    "lifecycle suffix boundaries",
    "src/policy.mod.ts",
    "function useMountain() {}\nconst useOnceMore = 1;\nconst useMountedState = () => {};\nconst useInitialValue = () => {};",
    NO_DIAGNOSTICS,
  ],
  [
    "database server scope",
    "src/shared/database/store.server.ts",
    "let value = 0;",
    TWO_DIAGNOSTICS,
  ],
  [
    "middleware scope",
    "src/shared/middlewares/state.mod.ts",
    "let value = 0;",
    ONE_DIAGNOSTIC,
  ],
  ["API scope", "src/routes/api/state.ts", "var value = 0;", ONE_DIAGNOSTIC],
  [
    "server test overlap",
    "src/shared/database/store.server.test.ts",
    "interface Body {}\nexpect(value instanceof Error);",
    THREE_DIAGNOSTICS,
  ],
  [
    "middleware test overlap",
    "src/shared/middlewares/state.mod.test.ts",
    "let value = 0;\ntype Body = {};\nexpect(value instanceof Error);",
    THREE_DIAGNOSTICS,
  ],
  [
    "client mutable state",
    "src/policy.mod.ts",
    "let value = 0;",
    NO_DIAGNOSTICS,
  ],
  [
    "ordinary server suffix",
    "src/store.server.ts",
    "let value = 0;",
    ONE_DIAGNOSTIC,
  ],
  [
    "server try restriction",
    "src/policy.mod.server.ts",
    "try {} catch {}",
    ONE_DIAGNOSTIC,
  ],
  [
    "source type declaration",
    "src/policy.mod.ts",
    "interface Body {}",
    NO_DIAGNOSTICS,
  ],
  [
    "tooling test types",
    "eslint-config/policy.test.ts",
    "interface Body {}",
    ONE_DIAGNOSTIC,
  ],
  [
    "test suffix scope",
    "src/policy.test.mts",
    "interface Body {}",
    TWO_DIAGNOSTICS,
  ],
  [
    "test JSX without JSX",
    "src/policy.mod.test.tsx",
    "export {};",
    NO_DIAGNOSTICS,
  ],
  ["declaration extension", "src/policy.d.ts", "export {};", ONE_DIAGNOSTIC],
  ["module CJS extension", "src/policy.cts", "export {};", ONE_DIAGNOSTIC],
  ["module ESM extension", "src/policy.mts", "export {};", ONE_DIAGNOSTIC],
  ["JavaScript filename", "src/policy.js", "export {};", NO_DIAGNOSTICS],
  [
    "route test exemption",
    "src/routes/-policy.test.tsx",
    "export {};",
    NO_DIAGNOSTICS,
  ],
];

describe("effective syntax policies after the Oxlint bridge", () => {
  const linter = createLinter();

  beforeAll(async () => {
    await linter.calculateConfigForFile("eslint.config.ts");
  }, CONFIG_LOAD_TIMEOUT_MS);

  it.each([
    [
      `${PLUGIN_NAMES.CorePolicy}/server-module-state`,
      "src/policy.mod.server.ts",
      "let state = 0;",
    ],
    [
      `${PLUGIN_NAMES.CorePolicy}/test-object-type`,
      "src/policy.mod.test.ts",
      "interface Body {}",
    ],
    [
      `${PLUGIN_NAMES.CorePolicy}/module-file-name`,
      "src/policy.ts",
      "export {};",
    ],
    [
      `${PLUGIN_NAMES.CorePolicy}/module-jsx`,
      "src/policy.mod.tsx",
      "export {};",
    ],
  ])(
    "keeps %s enabled after the bridge in %s",
    async (ruleId, filePath, code) => {
      const [result] = await linter.lintText(code, { filePath });
      expect.assert(result != null);
      expect(result.messages).toContainEqual(
        expect.objectContaining({ ruleId, severity: SEVERITY_LEVELS.Error }),
      );
    },
  );

  it("keeps the generated route tree ignored", async () => {
    expect(await linter.isPathIgnored("src/routeTree.gen.ts")).toBe(true);
  });

  it.each(cases)(
    "preserves %s in %s",
    async (...[_name, filePath, code, count]: SyntaxCase) => {
      const [result] = await linter.lintText(code, { filePath });

      expect.assert(result != null);
      expect(result.messages).toHaveLength(count);
      expect(
        result.messages.every(
          ({ ruleId, severity }) =>
            ruleId != null &&
            SYNTAX_RULE_IDS.has(ruleId) &&
            severity === SEVERITY_LEVELS.Error,
        ),
      ).toBe(true);
    },
  );
});

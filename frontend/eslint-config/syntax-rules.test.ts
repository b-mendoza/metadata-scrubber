import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { PLUGIN_NAMES, SEVERITY_LEVELS } from "./constants.ts";

const CONFIG_LOAD_TIMEOUT_MS = 30_000;
const RULE_IDS = {
  RestrictedSyntax: "no-restricted-syntax",
  ServerTryCatch: `${PLUGIN_NAMES.CorePolicy}/server-try-catch`,
  TestInstanceofAssertion: `${PLUGIN_NAMES.CorePolicy}/test-instanceof-assertion`,
  RuleContract: `${PLUGIN_NAMES.CorePolicy}/rule-contract`,
  E2ENetworkMock: `${PLUGIN_NAMES.CorePolicy}/e2e-network-mock`,
  PlaywrightWebServer: `${PLUGIN_NAMES.CorePolicy}/playwright-web-server`,
  ServerModuleState: `${PLUGIN_NAMES.CorePolicy}/server-module-state`,
  TestObjectType: `${PLUGIN_NAMES.CorePolicy}/test-object-type`,
  ModuleFileName: `${PLUGIN_NAMES.CorePolicy}/module-file-name`,
  ModuleJSX: `${PLUGIN_NAMES.CorePolicy}/module-jsx`,
};
const SYNTAX_RULE_IDS = new Set(Object.values(RULE_IDS));

type SyntaxCase = readonly [
  name: string,
  filePath: string,
  code: string,
  ruleIds: readonly string[],
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
    "rejects mutable state and a server TSX module",
    "src/state.mod.server.tsx",
    "let value = 0;",
    [RULE_IDS.ModuleFileName, RULE_IDS.ServerModuleState],
  ],
  [
    "rejects network mocks and local object types in end-to-end tests",
    "e2e/policy.test.ts",
    "page.route('/api', handler); interface Body {}",
    [RULE_IDS.E2ENetworkMock, RULE_IDS.TestObjectType],
  ],
  [
    "rejects default rule exports and local object types in rule tests",
    "oxlint-plugin-metadata-scrubber/rules/policy.test.ts",
    "export default {}; interface Body {}",
    [RULE_IDS.RuleContract, RULE_IDS.TestObjectType],
  ],
  [
    "allows factories and Error instances",
    "src/policy.mod.ts",
    "export const createService = () => ({ run: () => true });\nexport const createServiceError = (message: string, cause: unknown) => new Error(message, { cause });",
    [],
  ],
  [
    "rejects class declarations, expressions, and Error subclasses",
    "src/policy.mod.ts",
    "export class Service {}\nexport const ServiceExpression = class {};\nexport class ServiceError extends Error {}",
    [
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
    ],
  ],
  [
    "allows behavior hook names and non-function lifecycle names",
    "src/policy.mod.ts",
    'export function useUppyDashboard() {}\nexport const useUploadProgress = () => {};\nexport const useMountedState = function () {};\nexport function useInitialValue() {}\nexport const useMount = "event";',
    [],
  ],
  [
    "rejects lifecycle hook names and their suffixes",
    "src/policy.mod.ts",
    "export function useMount() {}\nexport const useOnMount = () => {};\nexport const useUnmount = function () {};\nexport function useOnUnmount() {}\nexport const useDidMount = () => {};\nexport const useWillUnmount = function () {};\nexport const useEffectOnce = () => {};\nexport const useOnce = function () {};\nexport function useInit() {}\nexport const useInitialize = () => {};\nexport const useFirstRender = function () {};\nexport function useMountUploader() {}\nexport const useMount2 = () => {};\nexport const useMount_uploader = () => {};",
    [
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
      RULE_IDS.RestrictedSyntax,
    ],
  ],
  [
    "allows constants and function-local mutable state in server modules",
    "src/policy.mod.server.ts",
    "export const requestCount = 0;\nexport const handleRequest = () => { let localCount = 0; localCount += 1; return localCount; };",
    [],
  ],
  [
    "rejects module-level let and var declarations in server modules",
    "src/policy.mod.server.ts",
    'export let requestCount = 0;\nvar requestTotal = 0, requestLabel = "request";\nexport { requestTotal, requestLabel };',
    [RULE_IDS.ServerModuleState, RULE_IDS.ServerModuleState],
  ],
  [
    "allows schema-derived types and function type aliases in tests",
    "src/policy.mod.test.ts",
    'import type { ZodString as Inputs } from "zod";\nimport type * as contracts from "zod";\nexport type CreateUpload = (input: contracts.output<Inputs>) => void;\nexport type Upload = contracts.output<Inputs>;',
    [],
  ],
  [
    "rejects local object aliases and interfaces in tests",
    "src/policy.mod.test.ts",
    "export type Upload = { storageKey: string };\nexport interface ResponseBody { status: string; }",
    [RULE_IDS.TestObjectType, RULE_IDS.TestObjectType],
  ],
  ["allows module names outside src", "outside.ts", "export {};", []],
  [
    "allows JSX fragments in modules",
    "src/fragment.mod.tsx",
    "export const fragment = <>text</>;",
    [],
  ],
  [
    "allows server test names",
    "src/plain.mod.server.test.ts",
    "export {};",
    [],
  ],
  ["allows the router entry file", "src/router.tsx", "export {};", []],
  ["allows route file names", "src/routes/index.tsx", "export {};", []],
  ["allows the start entry file", "src/start.ts", "export {};", []],
  [
    "allows the test setup file",
    "src/tests/setup-test-environment.ts",
    "export {};",
    [],
  ],
  [
    "allows JSX elements in modules",
    "src/view.mod.tsx",
    "export const view = <div />;",
    [],
  ],
  [
    "rejects source names without mod",
    "src/a-plain.ts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects TSX modules without JSX",
    "src/b-empty.mod.tsx",
    "export {};",
    [RULE_IDS.ModuleJSX],
  ],
  [
    "rejects server TSX names",
    "src/c-server.mod.server.tsx",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects the test.server suffix order",
    "src/d-test.mod.test.server.ts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects nested router names without mod",
    "src/nested/router.tsx",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects other setup names without mod",
    "src/tests/other-setup.ts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects test helper names without mod",
    "src/tests/utils/helper.ts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects classes in tooling",
    "eslint-config/constants.ts",
    "class Service {}",
    [RULE_IDS.RestrictedSyntax],
  ],
  [
    "rejects lifecycle hook names in tooling",
    "eslint-config/constants.ts",
    "const useMount = () => {};",
    [RULE_IDS.RestrictedSyntax],
  ],
  [
    "allows lifecycle near-matches and non-function names",
    "src/policy.mod.ts",
    "function useMountain() {}\nconst useOnceMore = 1;\nconst useMountedState = () => {};\nconst useInitialValue = () => {};",
    [],
  ],
  [
    "rejects mutable state and missing mod in database server modules",
    "src/shared/database/store.server.ts",
    "let value = 0;",
    [RULE_IDS.ModuleFileName, RULE_IDS.ServerModuleState],
  ],
  [
    "rejects mutable state in middleware modules",
    "src/shared/middlewares/state.mod.ts",
    "let value = 0;",
    [RULE_IDS.ServerModuleState],
  ],
  [
    "rejects mutable state in API routes",
    "src/routes/api/state.ts",
    "var value = 0;",
    [RULE_IDS.ServerModuleState],
  ],
  [
    "keeps filename and test policies in server tests",
    "src/shared/database/store.server.test.ts",
    "interface Body {}\nexpect(value instanceof Error);",
    [
      RULE_IDS.ModuleFileName,
      RULE_IDS.TestObjectType,
      RULE_IDS.TestInstanceofAssertion,
    ],
  ],
  [
    "keeps state and test policies in middleware tests",
    "src/shared/middlewares/state.mod.test.ts",
    "let value = 0;\ntype Body = {};\nexpect(value instanceof Error);",
    [
      RULE_IDS.ServerModuleState,
      RULE_IDS.TestObjectType,
      RULE_IDS.TestInstanceofAssertion,
    ],
  ],
  [
    "allows mutable state in client modules",
    "src/policy.mod.ts",
    "let value = 0;",
    [],
  ],
  [
    "rejects missing mod in ordinary server names",
    "src/store.server.ts",
    "let value = 0;",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects try statements in server modules",
    "src/policy.mod.server.ts",
    "try {} catch {}",
    [RULE_IDS.ServerTryCatch],
  ],
  [
    "allows object types outside tests",
    "src/policy.mod.ts",
    "interface Body {}",
    [],
  ],
  [
    "rejects local object types in tooling tests",
    "eslint-config/policy.test.ts",
    "interface Body {}",
    [RULE_IDS.TestObjectType],
  ],
  [
    "keeps test policies for mts files",
    "src/policy.test.mts",
    "interface Body {}",
    [RULE_IDS.ModuleFileName, RULE_IDS.TestObjectType],
  ],
  ["allows TSX tests without JSX", "src/policy.mod.test.tsx", "export {};", []],
  [
    "rejects declaration names without mod",
    "src/policy.d.ts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects CJS names without mod",
    "src/policy.cts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  [
    "rejects ESM names without mod",
    "src/policy.mts",
    "export {};",
    [RULE_IDS.ModuleFileName],
  ],
  ["allows JavaScript names without mod", "src/policy.js", "export {};", []],
  [
    "allows route test names without mod",
    "src/routes/-policy.test.tsx",
    "export {};",
    [],
  ],
];

describe("effective syntax policies after the Oxlint bridge", () => {
  const linter = createLinter();

  beforeAll(async () => {
    await linter.calculateConfigForFile("eslint.config.ts");
  }, CONFIG_LOAD_TIMEOUT_MS);

  it("keeps the generated route tree ignored", async () => {
    expect(await linter.isPathIgnored("src/routeTree.gen.ts")).toBe(true);
  });

  it.each(cases)(
    "%s in %s",
    async (...[_name, filePath, code, ruleIds]: SyntaxCase) => {
      const [result] = await linter.lintText(code, { filePath });

      expect.assert(result != null);
      expect(result.messages.map(({ ruleId }) => ruleId)).toEqual(ruleIds);
      expect(result.messages.map(({ severity }) => severity)).toEqual(
        ruleIds.map(() => SEVERITY_LEVELS.Error),
      );
    },
  );
});

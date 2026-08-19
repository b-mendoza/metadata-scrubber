import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isFunction, isTestFile } from "../utils.ts";

type RuntimeVitestImportDefinition = Definition & {
  readonly node: ESTree.ImportSpecifier;
  readonly parent: ESTree.ImportDeclaration;
};
type TestApi = "describe" | "it" | "test";
type TestCallback = ESTree.ArrowFunctionExpression | ESTree.Function;

interface TestApiCallChain {
  readonly hasSkip: boolean;
  readonly rootApi: TestApi;
}

const NO_DEFINITIONS = 0;
const TEST_FUNCTION_NAMES = new Set<TestApi>(["it", "test"]);
const SKIPPABLE_NAMES = new Set<TestApi>(["describe", "it", "test"]);

const getImportedName = (
  specifier: ESTree.ImportSpecifier,
): string | undefined => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : undefined;
};

const isTestApiName = (name: string): name is TestApi =>
  name === "describe" || name === "it" || name === "test";

const isRuntimeVitestImportDefinition = (
  definition: Definition,
): definition is RuntimeVitestImportDefinition =>
  definition.type === "ImportBinding" &&
  definition.node.type === "ImportSpecifier" &&
  definition.node.importKind !== "type" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === "vitest";

const getVitestTestApiImportDefinition = (
  definition: Definition,
): TestApi | undefined => {
  if (!isRuntimeVitestImportDefinition(definition)) return undefined;
  const importedName = getImportedName(definition.node);
  return importedName !== undefined && isTestApiName(importedName)
    ? importedName
    : undefined;
};

const getVitestTestApiImport = (variable: Variable): TestApi | undefined => {
  for (const definition of variable.defs) {
    const testApi = getVitestTestApiImportDefinition(definition);
    if (testApi !== undefined) return testApi;
  }
  return undefined;
};

const getTestApiName = (name: string): TestApi | undefined =>
  isTestApiName(name) ? name : undefined;

const getVitestTestApiVariable = (
  variable: Variable,
  referencedName: string,
): TestApi | undefined =>
  variable.defs.length === NO_DEFINITIONS
    ? getTestApiName(referencedName)
    : getVitestTestApiImport(variable);

const getVitestTestApiReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): TestApi | undefined => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      return getVitestTestApiVariable(variable, node.name);
    }
    scope = scope.upper;
  }
  return getTestApiName(node.name);
};

const getTestApiCallChain = (
  node: ESTree.Expression | ESTree.Super,
  sourceCode: SourceCode,
): TestApiCallChain | undefined => {
  if (node.type === "Identifier") {
    const rootApi = getVitestTestApiReference(node, sourceCode);
    return rootApi === undefined ? undefined : { hasSkip: false, rootApi };
  }
  if (node.type === "CallExpression") {
    return getTestApiCallChain(node.callee, sourceCode);
  }
  if (node.type !== "MemberExpression") return undefined;
  const chain = getTestApiCallChain(node.object, sourceCode);
  if (chain === undefined) return undefined;
  return {
    hasSkip: chain.hasSkip || getStaticPropertyName(node) === "skip",
    rootApi: chain.rootApi,
  };
};

const getTestCallback = (
  node: ESTree.CallExpression,
): TestCallback | undefined =>
  node.arguments.find(
    (argument): argument is TestCallback =>
      argument.type === "ArrowFunctionExpression" ||
      argument.type === "FunctionExpression",
  );

const getEnclosingTestApi = (
  node: ESTree.ReturnStatement,
  callbacks: WeakMap<TestCallback, string>,
): string | undefined => {
  let current: ESTree.Node | null = node.parent;
  while (current !== null) {
    if (isFunction(current)) return callbacks.get(current);
    current = current.parent;
  }
  return undefined;
};

const getGuardIfStatement = (
  node: ESTree.ReturnStatement,
): ESTree.IfStatement | undefined => {
  const { parent } = node;
  if (parent.type === "IfStatement") {
    return parent.consequent === node ? parent : undefined;
  }
  if (parent.type !== "BlockStatement") return undefined;
  const ifStatement = parent.parent;
  return ifStatement.type === "IfStatement" && ifStatement.consequent === parent
    ? ifStatement
    : undefined;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow skipped tests and silent prerequisite guards.",
    },
    messages: {
      disabledTest:
        "`{{ testApi }}` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with `expect(prerequisite).toBe(true)` inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage.",
      silentPrerequisiteGuard:
        "The `{{ guard }}` test prerequisite guard uses a bare `return` in `{{ testApi }}`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect(prerequisite).toBe(true)`. Then continue the test.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    const testCallbacks = new WeakMap<TestCallback, string>();

    return {
      CallExpression(node) {
        const chain = getTestApiCallChain(node.callee, context.sourceCode);
        if (chain === undefined) return;
        if (
          node.parent.type === "CallExpression" &&
          node.parent.callee === node
        ) {
          return;
        }
        const testApi = context.sourceCode.getText(node.callee);
        if (chain.hasSkip && SKIPPABLE_NAMES.has(chain.rootApi)) {
          context.report({
            node,
            messageId: "disabledTest",
            data: { testApi },
          });
          return;
        }
        if (!TEST_FUNCTION_NAMES.has(chain.rootApi)) return;
        const callback = getTestCallback(node);
        if (callback === undefined) return;
        testCallbacks.set(callback, testApi);
      },
      ReturnStatement(node) {
        if (node.argument !== null) return;
        const ifStatement = getGuardIfStatement(node);
        if (ifStatement?.alternate !== null) return;
        const testApi = getEnclosingTestApi(node, testCallbacks);
        if (testApi === undefined) return;
        context.report({
          node,
          messageId: "silentPrerequisiteGuard",
          data: {
            guard: context.sourceCode.getText(ifStatement.test),
            testApi,
          },
        });
      },
    };
  },
});

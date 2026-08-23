import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isFunction, isTestFile } from "../utilities.ts";

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

const getImportedName = (specifier: ESTree.ImportSpecifier): string | null => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : null;
};

const isTestApiName = (name: string): name is TestApi =>
  ["describe", "it", "test"].includes(name);

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
): TestApi | null => {
  if (!isRuntimeVitestImportDefinition(definition)) return null;
  const importedName = getImportedName(definition.node);
  return importedName != null && isTestApiName(importedName)
    ? importedName
    : null;
};

const getVitestTestApiImport = (variable: Variable): TestApi | null => {
  for (const definition of variable.defs) {
    const testApi = getVitestTestApiImportDefinition(definition);
    if (testApi != null) return testApi;
  }
  return null;
};

const getTestApiName = (name: string): TestApi | null =>
  isTestApiName(name) ? name : null;

const getVitestTestApiVariable = (
  variable: Variable,
  referencedName: string,
): TestApi | null =>
  variable.defs.length === NO_DEFINITIONS
    ? getTestApiName(referencedName)
    : getVitestTestApiImport(variable);

const getVitestTestApiReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): TestApi | null => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const variable = scope.set.get(node.name);
    if (variable != null) {
      return getVitestTestApiVariable(variable, node.name);
    }
    scope = scope.upper;
  }
  return getTestApiName(node.name);
};

const getTestApiCallChain = (
  node: ESTree.Expression | ESTree.Super,
  sourceCode: SourceCode,
): TestApiCallChain | null => {
  if (node.type === "Identifier") {
    const rootApi = getVitestTestApiReference(node, sourceCode);
    return rootApi == null ? null : { hasSkip: false, rootApi };
  }
  if (node.type === "CallExpression") {
    return getTestApiCallChain(node.callee, sourceCode);
  }
  if (node.type !== "MemberExpression") return null;
  const chain = getTestApiCallChain(node.object, sourceCode);
  if (chain == null) return null;
  return {
    hasSkip: chain.hasSkip || getStaticPropertyName(node) === "skip",
    rootApi: chain.rootApi,
  };
};

const getTestCallback = (node: ESTree.CallExpression): TestCallback | null =>
  node.arguments.find(
    (argument): argument is TestCallback =>
      argument.type === "ArrowFunctionExpression" ||
      argument.type === "FunctionExpression",
  ) ?? null;

const getEnclosingTestApi = (
  node: ESTree.ReturnStatement,
  callbacks: WeakMap<TestCallback, string>,
): string | null => {
  let current: ESTree.Node | null = node.parent;
  while (current != null) {
    if (isFunction(current)) return callbacks.get(current) ?? null;
    current = current.parent;
  }
  return null;
};

const getGuardIfStatement = (
  node: ESTree.ReturnStatement,
): ESTree.IfStatement | null => {
  const { parent } = node;
  if (parent.type === "IfStatement") {
    return parent.consequent === node ? parent : null;
  }
  if (parent.type !== "BlockStatement") return null;
  const ifStatement = parent.parent;
  return ifStatement.type === "IfStatement" && ifStatement.consequent === parent
    ? ifStatement
    : null;
};

const getGuardAssertion = (
  test: ESTree.Expression,
  sourceCode: SourceCode,
): string =>
  test.type === "UnaryExpression" &&
  test.operator === "!" &&
  test.argument.type === "Identifier"
    ? `expect(${test.argument.name}).toBeTruthy()`
    : `expect((${sourceCode.getText(test)})).toBeFalsy()`;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow skipped tests and silent prerequisite guards.",
    },
    messages: {
      disabledTest:
        "`{{ testApi }}` disables a suite or test. Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.",
      silentPrerequisiteGuard:
        "The `{{ guard }}` test prerequisite guard uses a bare `return` in `{{ testApi }}`. This return makes the test pass without its behavior assertions. Replace the guard exit with `{{ assertion }}`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    const testCallbacks = new WeakMap<TestCallback, string>();

    return {
      CallExpression(node) {
        const chain = getTestApiCallChain(node.callee, context.sourceCode);
        if (chain == null) return;
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
        if (callback == null) return;
        testCallbacks.set(callback, testApi);
      },
      ReturnStatement(node) {
        if (node.argument != null) return;
        const ifStatement = getGuardIfStatement(node);
        if (ifStatement == null || ifStatement.alternate != null) return;
        const testApi = getEnclosingTestApi(node, testCallbacks);
        if (testApi == null) return;
        context.report({
          node,
          messageId: "silentPrerequisiteGuard",
          data: {
            assertion: getGuardAssertion(ifStatement.test, context.sourceCode),
            guard: context.sourceCode.getText(ifStatement.test),
            testApi,
          },
        });
      },
    };
  },
});

import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isTestFile } from "../utils.ts";

const TEST_FUNCTION_NAMES = new Set(["it", "test"]);
const SKIPPABLE_NAMES = new Set(["describe", "it", "test"]);

type TestCallback = ESTree.ArrowFunctionExpression | ESTree.Function;

const isSkipCall = (node: ESTree.CallExpression): boolean => {
  if (
    node.callee.type !== "MemberExpression" ||
    getStaticPropertyName(node.callee) !== "skip"
  ) {
    return false;
  }
  return (
    node.callee.object.type === "Identifier" &&
    SKIPPABLE_NAMES.has(node.callee.object.name)
  );
};

const isTestCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === "Identifier") {
    return TEST_FUNCTION_NAMES.has(node.callee.name);
  }
  if (node.callee.type !== "MemberExpression") return false;
  return (
    node.callee.object.type === "Identifier" &&
    TEST_FUNCTION_NAMES.has(node.callee.object.name) &&
    getStaticPropertyName(node.callee) !== "skip"
  );
};

const getTestCallback = (
  node: ESTree.CallExpression,
): TestCallback | undefined =>
  node.arguments.find(
    (argument): argument is TestCallback =>
      argument.type === "ArrowFunctionExpression" ||
      argument.type === "FunctionExpression",
  );

const isInsideTestCallback = (
  node: ESTree.ReturnStatement,
  callbacks: WeakSet<TestCallback>,
): boolean => {
  let current: ESTree.Node | null = node.parent;
  while (current !== null) {
    if (
      (current.type === "ArrowFunctionExpression" ||
        current.type === "FunctionExpression") &&
      callbacks.has(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
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
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    const testCallbacks = new WeakSet<TestCallback>();

    return {
      CallExpression(node) {
        if (isSkipCall(node)) {
          context.report({
            node,
            message:
              "Fail when a test prerequisite is missing. Do not skip the test.",
          });
          return;
        }
        if (!isTestCall(node)) return;
        const callback = getTestCallback(node);
        if (callback !== undefined) testCallbacks.add(callback);
      },
      ReturnStatement(node) {
        if (node.argument !== null) return;
        const ifStatement = getGuardIfStatement(node);
        if (
          ifStatement?.alternate !== null ||
          !isInsideTestCallback(node, testCallbacks)
        ) {
          return;
        }
        context.report({
          node,
          message:
            "Fail when a test prerequisite is missing. Do not return from the test silently.",
        });
      },
    };
  },
});

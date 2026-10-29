import type { Definition, ESTree, SourceCode } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getReferencedVariable,
  getRuntimeImportDeclaration,
  getStaticPropertyName,
} from "../utilities.ts";

const RESULT_FACTORIES = new Set([
  "err",
  "errAsync",
  "ok",
  "okAsync",
  "Result.combine",
  "ResultAsync.combine",
  "ResultAsync.fromPromise",
  "ResultAsync.fromSafePromise",
  "safeTry",
]);
const RESULT_METHODS = new Set([
  "andThen",
  "andThrough",
  "andTee",
  "asyncAndThen",
  "asyncAndThrough",
  "asyncMap",
  "map",
  "mapErr",
  "orElse",
  "orTee",
]);

const isTransparentExpression = (
  node: ESTree.Node,
): node is
  | ESTree.TSAsExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSTypeAssertion
  | ESTree.TSInstantiationExpression
  | ESTree.ParenthesizedExpression
  | ESTree.ChainExpression =>
  [
    "TSAsExpression",
    "TSSatisfiesExpression",
    "TSNonNullExpression",
    "TSTypeAssertion",
    "TSInstantiationExpression",
    "ParenthesizedExpression",
    "ChainExpression",
  ].includes(node.type);

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let expression = node;
  while (isTransparentExpression(expression)) {
    ({ expression } = expression);
  }
  return expression;
};

const getImportApi = (definition: Definition): string | null => {
  const declaration = getRuntimeImportDeclaration(definition);
  if (declaration?.source.value !== "neverthrow") {
    return null;
  }
  if (definition.node.type === "ImportNamespaceSpecifier") return "*";
  if (definition.node.type !== "ImportSpecifier") {
    return null;
  }
  const { imported } = definition.node;
  return imported.type === "Identifier" ? imported.name : imported.value;
};

const getNeverthrowReference = (
  node: Extract<ESTree.Node, { type: "Identifier" }>,
  sourceCode: SourceCode,
): string | null => {
  const binding = getReferencedVariable(node, sourceCode);
  return (
    (binding?.defs ?? [])
      .map((definition) => getImportApi(definition))
      .find((api) => api != null) ?? null
  );
};

const getNeverthrowApi = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): string | null => {
  const expression = unwrapExpression(node);
  if (expression.type === "Identifier") {
    return getNeverthrowReference(expression, sourceCode);
  }
  if (expression.type !== "MemberExpression") return null;
  const owner = getNeverthrowApi(expression.object, sourceCode);
  const property = getStaticPropertyName(expression);
  if (owner == null || property == null) return null;
  return owner === "*" ? property : `${owner}.${property}`;
};

const unwrapDiscardedExpression = (node: ESTree.Node): ESTree.Node => {
  let expression = unwrapExpression(node);
  while (
    expression.type === "AwaitExpression" ||
    (expression.type === "UnaryExpression" && expression.operator === "void")
  ) {
    expression = unwrapExpression(expression.argument);
  }
  return expression;
};

const getThrowableFactorySource = (
  callee: ESTree.CallExpression,
  sourceCode: SourceCode,
): string | null => {
  const factory = getNeverthrowApi(callee.callee, sourceCode);
  return factory === "Result.fromThrowable" ||
    factory === "ResultAsync.fromThrowable"
    ? sourceCode.getText(callee.callee)
    : null;
};

const getResultSource = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): string | null => {
  const expression = unwrapDiscardedExpression(node);
  if (expression.type !== "CallExpression") return null;
  const callee = unwrapExpression(expression.callee);
  const api = getNeverthrowApi(callee, sourceCode);
  if (api != null && RESULT_FACTORIES.has(api)) {
    return sourceCode.getText(callee);
  }
  if (callee.type === "CallExpression") {
    return getThrowableFactorySource(callee, sourceCode);
  }
  return callee.type === "MemberExpression" &&
    RESULT_METHODS.has(getStaticPropertyName(callee) ?? "")
    ? getResultSource(callee.object, sourceCode)
    : null;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require handling of discarded neverthrow results.",
    },
    messages: {
      discardedResult:
        "`{{ source }}` discards a neverthrow result. Assign the result and check `isErr()`. Throw or return the error at the boundary: `const result = await operation(); if (result.isErr()) { throw result.error; } return result.value;`.",
    },
  },
  create(context) {
    return {
      ExpressionStatement(node) {
        // shortcut: user function results need type information, not name guesses.
        const source = getResultSource(node.expression, context.sourceCode);
        if (source == null) return;
        context.report({
          node,
          messageId: "discardedResult",
          data: { source },
        });
      },
    };
  },
});

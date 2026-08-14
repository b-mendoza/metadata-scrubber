import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName } from "../utils.ts";

const EFFECT_NAMESPACES = new Set(["Data", "Schema"]);
const EFFECT_BASE_NAMES = new Set([
  "Class",
  "TaggedClass",
  "TaggedError",
  "TaggedRequest",
  "TaggedStruct",
]);

const isEffectBaseClassCall = (
  node: ESTree.Expression | null | undefined,
): boolean => {
  if (node?.type !== "CallExpression") return false;
  if (node.callee.type === "MemberExpression") {
    const propertyName = getStaticPropertyName(node.callee);
    return (
      propertyName !== undefined &&
      EFFECT_BASE_NAMES.has(propertyName) &&
      node.callee.object.type === "Identifier" &&
      EFFECT_NAMESPACES.has(node.callee.object.name)
    );
  }
  return isEffectBaseClassCall(node.callee);
};

type TransparentExpression =
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression;

const isTransparentExpression = (
  node: ESTree.Expression,
): node is TransparentExpression =>
  node.type === "TSInstantiationExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "ParenthesizedExpression";

const unwrapTransparentExpressions = (
  node: ESTree.Expression | null,
): ESTree.Expression | null => {
  let expression = node;
  while (expression !== null && isTransparentExpression(expression)) {
    const { expression: innerExpression } = expression;
    expression = innerExpression;
  }
  return expression;
};

const isAllowedEffectClass = (node: ESTree.Class): boolean => {
  const { superClass } = node;
  return isEffectBaseClassCall(unwrapTransparentExpressions(superClass));
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Use factory functions by default and allow Effect tagged types as the class exception.",
    },
  },
  create(context) {
    const checkClass = (node: ESTree.Class): void => {
      if (isAllowedEffectClass(node)) return;
      context.report({
        node,
        message:
          "Use factory functions by default. Effect tagged types and similar Effect base classes are the exception.",
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

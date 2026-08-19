import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
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

const getImportedName = (
  specifier: ESTree.ImportSpecifier,
): string | undefined => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : undefined;
};

const isEffectNamespaceImportDefinition = (definition: Definition): boolean => {
  if (definition.type !== "ImportBinding") return false;
  if (definition.node.type !== "ImportSpecifier") return false;
  if (definition.parent?.type !== "ImportDeclaration") return false;
  const importedName = getImportedName(definition.node);
  return (
    definition.parent.source.value === "effect" &&
    importedName !== undefined &&
    EFFECT_NAMESPACES.has(importedName)
  );
};

const isEffectNamespaceImport = (variable: Variable): boolean =>
  variable.defs.some(isEffectNamespaceImportDefinition);

const isEffectNamespaceReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): boolean => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) return isEffectNamespaceImport(variable);
    scope = scope.upper;
  }
  return false;
};

const isEffectBaseClassCall = (
  node: ESTree.Expression | null | undefined,
  sourceCode: SourceCode,
): boolean => {
  if (node?.type !== "CallExpression") return false;
  if (node.callee.type === "MemberExpression") {
    const propertyName = getStaticPropertyName(node.callee);
    return (
      propertyName !== undefined &&
      EFFECT_BASE_NAMES.has(propertyName) &&
      node.callee.object.type === "Identifier" &&
      isEffectNamespaceReference(node.callee.object, sourceCode)
    );
  }
  return isEffectBaseClassCall(node.callee, sourceCode);
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

const isAllowedEffectClass = (
  node: ESTree.Class,
  sourceCode: SourceCode,
): boolean => {
  const { superClass } = node;
  return isEffectBaseClassCall(
    unwrapTransparentExpressions(superClass),
    sourceCode,
  );
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
      if (isAllowedEffectClass(node, context.sourceCode)) return;
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

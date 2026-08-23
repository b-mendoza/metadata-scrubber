import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName } from "../utilities.ts";

const EFFECT_NAMESPACES = new Set(["Data", "Schema"]);
const EFFECT_BASE_NAMES = new Set([
  "Class",
  "TaggedClass",
  "TaggedError",
  "TaggedRequest",
  "TaggedStruct",
]);

const getImportedName = (specifier: ESTree.ImportSpecifier): string | null => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : null;
};

const isEffectNamespaceImportDefinition = (definition: Definition): boolean => {
  if (definition.type !== "ImportBinding") return false;
  if (definition.node.type !== "ImportSpecifier") return false;
  if (definition.parent?.type !== "ImportDeclaration") return false;
  const importedName = getImportedName(definition.node);
  return (
    definition.parent.source.value === "effect" &&
    importedName != null &&
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
  while (scope != null) {
    const variable = scope.set.get(node.name);
    if (variable != null) return isEffectNamespaceImport(variable);
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
      propertyName != null &&
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
  while (expression != null && isTransparentExpression(expression)) {
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

const getClassName = (node: ESTree.Class): string => {
  if (node.id != null) return node.id.name;
  const { parent } = node;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  return "anonymous class";
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Use factory functions by default and allow Effect tagged types as the class exception.",
    },
    messages: {
      applicationClass:
        "`{{ className }}` is an application class. Replace it with a factory function that returns a plain object, for example `const createService = () => ({ run: () => true })`. Factory functions keep dependencies and mutable state explicit. Use a class only when it extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on `Data` or `Schema` imported from the `effect` package.",
    },
  },
  create(context) {
    const checkClass = (node: ESTree.Class): void => {
      if (isAllowedEffectClass(node, context.sourceCode)) return;
      context.report({
        node,
        messageId: "applicationClass",
        data: { className: getClassName(node) },
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

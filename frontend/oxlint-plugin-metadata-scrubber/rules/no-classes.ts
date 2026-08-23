import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName } from "../utilities.ts";

const EFFECT_NAMESPACES = new Set(["Data"]);
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
  [
    "TSInstantiationExpression",
    "TSAsExpression",
    "TSSatisfiesExpression",
    "TSNonNullExpression",
    "ParenthesizedExpression",
  ].includes(node.type);

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
        "Use plain functions and objects by default and allow Effect Data class constructors as the class exception.",
    },
    messages: {
      applicationClass:
        "`{{ className }}` is an application class. Replace it with plain functions and objects, for example a factory function such as `const createService = () => ({ run: () => true })`. Plain functions and objects keep dependencies and mutable state explicit. The only allowed class exception is a class that extends `Class`, `TaggedClass`, `TaggedError`, `TaggedRequest`, or `TaggedStruct` on the `Data` namespace imported from the `effect` package.",
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

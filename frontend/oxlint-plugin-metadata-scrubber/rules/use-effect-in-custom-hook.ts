import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isFunction } from "../utilities.ts";

const HOOK_NAME_PATTERN = /^use[A-Z0-9]/v;
const NO_TEMPLATE_EXPRESSIONS = 0;

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

const getOutermostExpression = (node: ESTree.Node): ESTree.Node => {
  let expression = node;
  while (
    expression.parent != null &&
    isTransparentExpression(expression.parent) &&
    expression.parent.expression === expression
  ) {
    expression = expression.parent;
  }
  return expression;
};

const isPatternTarget = (node: ESTree.Node): boolean => {
  const { parent } = node;
  if (parent?.type === "AssignmentPattern") return parent.left === node;
  if (parent?.type === "Property") {
    return parent.value === node && parent.parent.type === "ObjectPattern";
  }
  return (
    parent != null &&
    ["ArrayPattern", "ObjectPattern", "RestElement"].includes(parent.type)
  );
};

const isWriteOnlyTarget = (node: ESTree.Node): boolean => {
  const expression = getOutermostExpression(node);
  const { parent } = expression;
  if (parent == null) return false;
  if (isPatternTarget(expression)) return isWriteOnlyTarget(parent);
  if (parent.type === "AssignmentExpression") {
    return parent.operator === "=" && parent.left === expression;
  }
  return (
    (parent.type === "ForInStatement" || parent.type === "ForOfStatement") &&
    parent.left === expression
  );
};

const getBinding = (
  node: Extract<ESTree.Node, { type: "Identifier" }>,
  sourceCode: SourceCode,
): Variable | null => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const reference = scope.references.find(
      (candidate) => candidate.identifier === node,
    );
    if (reference != null) return reference.resolved;
    scope = scope.upper;
  }
  return null;
};

const getImportedName = (specifier: ESTree.ImportSpecifier): string | null => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : null;
};

const isReactEffectImport = (definition: Definition): boolean =>
  definition.type === "ImportBinding" &&
  definition.node.type === "ImportSpecifier" &&
  definition.node.importKind !== "type" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === "react" &&
  getImportedName(definition.node) === "useEffect";

const isReactNamespaceImport = (definition: Definition): boolean =>
  definition.type === "ImportBinding" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === "react" &&
  (definition.node.type === "ImportDefaultSpecifier" ||
    definition.node.type === "ImportNamespaceSpecifier");

const getConstInitializer = (definition: Definition): ESTree.Node | null => {
  if (
    definition.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.node.id.type !== "Identifier" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const"
  ) {
    return null;
  }
  return definition.node.init;
};

const isReactNamespace = (
  node: ESTree.Node,
  sourceCode: SourceCode,
  visited: Set<Variable>,
): boolean => {
  const expression = unwrapExpression(node);
  if (expression.type !== "Identifier") return false;
  const binding = getBinding(expression, sourceCode);
  if (binding == null || visited.has(binding)) return false;
  visited.add(binding);
  for (const definition of binding.defs) {
    if (isReactNamespaceImport(definition)) return true;
    const initializer = getConstInitializer(definition);
    if (
      initializer != null &&
      isReactNamespace(initializer, sourceCode, visited)
    ) {
      return true;
    }
  }
  return false;
};

const isTypeOnlyExport = (node: ESTree.Node): boolean =>
  (node.type === "ExportNamedDeclaration" || node.type === "ExportSpecifier") &&
  node.exportKind === "type";

const isTypePosition = (node: ESTree.Node): boolean => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor != null) {
    if (
      ancestor.type === "TSTypeQuery" ||
      ancestor.type === "TSTypeReference" ||
      ancestor.type === "TSTypeAnnotation" ||
      isTypeOnlyExport(ancestor)
    ) {
      return true;
    }
    ancestor = ancestor.parent;
  }
  return false;
};

const hasHookOwner = (node: ESTree.Node): boolean => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor != null) {
    if (isFunction(ancestor)) {
      const expression = getOutermostExpression(ancestor);
      const { parent } = expression;
      if (
        parent?.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        return HOOK_NAME_PATTERN.test(parent.id.name);
      }
      return ancestor.id != null && HOOK_NAME_PATTERN.test(ancestor.id.name);
    }
    ancestor = ancestor.parent;
  }
  return false;
};

const getStaticKeyValue = (node: ESTree.Node): string | null => {
  const key = unwrapExpression(node);
  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }
  if (
    key.type !== "TemplateLiteral" ||
    key.expressions.length > NO_TEMPLATE_EXPRESSIONS
  ) {
    return null;
  }
  const [quasi] = key.quasis;
  return quasi?.value.cooked ?? null;
};

const getDestructuredPropertyName = (node: ESTree.Node): string | null => {
  if (node.type !== "Property") return null;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  return getStaticKeyValue(node.key);
};

const getDestructuringSource = (
  node: ESTree.ObjectPattern,
): ESTree.Node | null => {
  const { parent } = node;
  if (parent.type === "VariableDeclarator") {
    return parent.init;
  }
  if (parent.type === "AssignmentExpression") {
    return parent.right;
  }
  return null;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require React Effects to belong to named custom hooks.",
    },
    messages: {
      effectOutsideCustomHook:
        "React `{{ reference }}` is outside a named custom hook. Effects synchronize with external systems. Calculate derived values during render and handle user actions in event handlers. If external synchronization is necessary, put its setup and cleanup in a purpose-named hook such as `useUppyInstance`. Do not hide it in `useMount` or `useUnmount`. Read https://react.dev/learn/you-might-not-need-an-effect.",
      effectExtraction:
        "Do not extract React `{{ reference }}`. Call it directly inside a named custom hook. Extraction hides the call owner. Effects synchronize with external systems. Calculate derived values during render and handle user actions in event handlers. If external synchronization is necessary, put its setup and cleanup in a purpose-named hook such as `useUppyInstance`. Do not hide it in `useMount` or `useUnmount`. Read https://react.dev/learn/you-might-not-need-an-effect.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const checkEffectReference = (node: ESTree.Node): void => {
      if (isTypePosition(node) || isWriteOnlyTarget(node)) return;
      const expression = getOutermostExpression(node);
      const { parent } = expression;
      const isDirectCall =
        parent?.type === "CallExpression" && parent.callee === expression;
      if (isDirectCall && hasHookOwner(parent)) return;
      context.report({
        node,
        messageId: isDirectCall
          ? "effectOutsideCustomHook"
          : "effectExtraction",
        data: { reference: sourceCode.getText(node) },
      });
    };

    return {
      Identifier(node) {
        const binding = getBinding(node, sourceCode);
        if (binding == null) return;
        if (
          binding.defs.every((definition) => !isReactEffectImport(definition))
        ) {
          return;
        }
        if (
          binding.references.every(
            (reference) => reference.identifier !== node || !reference.isRead(),
          )
        ) {
          return;
        }
        checkEffectReference(node);
      },
      MemberExpression(node) {
        const propertyName =
          getStaticPropertyName(node) ??
          (node.computed ? getStaticKeyValue(node.property) : null);
        if (
          propertyName !== "useEffect" ||
          !isReactNamespace(node.object, sourceCode, new Set<Variable>())
        ) {
          return;
        }
        checkEffectReference(node);
      },
      ObjectPattern(node) {
        const source = getDestructuringSource(node);
        if (
          source == null ||
          !isReactNamespace(source, sourceCode, new Set<Variable>())
        ) {
          return;
        }
        for (const property of node.properties) {
          if (
            property.type !== "Property" ||
            getDestructuredPropertyName(property) !== "useEffect"
          ) {
            continue;
          }
          const namespace = sourceCode.getText(unwrapExpression(source));
          const member = property.computed
            ? `[${sourceCode.getText(property.key)}]`
            : ".useEffect";
          context.report({
            node: property,
            messageId: "effectExtraction",
            data: { reference: `${namespace}${member}` },
          });
        }
      },
    };
  },
});

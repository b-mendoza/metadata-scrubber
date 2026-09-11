import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isFunction } from "../utilities.ts";

const QUERY_SOURCE = "@tanstack/react-query";
const NO_TEMPLATE_EXPRESSIONS = 0;

const TYPE_POSITION_NODE_TYPES = new Set<ESTree.Node["type"]>([
  "TSTypeAnnotation",
  "TSTypeQuery",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSInterfaceHeritage",
  "TSClassImplements",
  "TSTypeParameterInstantiation",
  "TSTypeParameterDeclaration",
]);

const EXPRESSION_WRAPPER_TYPES = new Set<ESTree.Node["type"]>([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "TSInstantiationExpression",
  "ParenthesizedExpression",
]);

const isExpressionWrapper = (
  node: ESTree.Node,
): node is
  | ESTree.TSAsExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion
  | ESTree.TSNonNullExpression
  | ESTree.TSInstantiationExpression
  | ESTree.ParenthesizedExpression => EXPRESSION_WRAPPER_TYPES.has(node.type);

const getNamespaceBinding = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): Variable | null => {
  if (node.type !== "Identifier") return null;
  // A type-only declaration can shadow the name without shadowing its value.
  // Switch discriminants can have their reference in an upper scope.
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const reference = scope.references.find(
      (candidate) => candidate.identifier === node,
    );
    if (reference != null) return reference.resolved;
    ({ upper: scope } = scope);
  }
  return null;
};

const getFixedKeyName = (node: ESTree.Node): string | null => {
  let key = node;
  while (isExpressionWrapper(key)) {
    ({ expression: key } = key);
  }
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  if (
    key.type === "TemplateLiteral" &&
    key.expressions.length === NO_TEMPLATE_EXPRESSIONS
  ) {
    const [quasi] = key.quasis;
    return quasi?.value.cooked ?? null;
  }
  return null;
};

const isQueryNamespaceImport = (definition: Definition): boolean =>
  definition.type === "ImportBinding" &&
  definition.node.type === "ImportNamespaceSpecifier" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === QUERY_SOURCE;

const getNamespaceAliasInitializer = (
  variable: Variable,
): ESTree.Expression | null => {
  const [definition] = variable.defs;
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.node.id.type !== "Identifier" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const"
  ) {
    return null;
  }
  return definition.node.init;
};

const isQueryNamespaceReference = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): boolean => {
  let expression: ESTree.Node | null = node;
  const visited = new Set<Variable>();
  while (expression != null) {
    if (isExpressionWrapper(expression)) {
      ({ expression } = expression);
      continue;
    }
    const variable = getNamespaceBinding(expression, sourceCode);
    if (variable == null || visited.has(variable)) return false;
    visited.add(variable);
    if (variable.defs.some(isQueryNamespaceImport)) return true;
    expression = getNamespaceAliasInitializer(variable);
  }
  return false;
};

const isTypePosition = (node: ESTree.Node): boolean => {
  let { parent } = node;
  while (parent != null && parent.type !== "Program") {
    if (isFunction(parent)) return false;
    if (TYPE_POSITION_NODE_TYPES.has(parent.type)) return true;
    ({ parent } = parent);
  }
  return false;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow runtime useQuery references from @tanstack/react-query.",
    },
    messages: {
      useSuspenseQuery:
        "`{{ reference }}` exposes `useQuery` from `@tanstack/react-query`. This API does not suspend for pending data. Use `useSuspenseQuery` from `@tanstack/react-query` with a parent `Suspense` boundary and a loading fallback. A boundary returned by the consuming component cannot catch that component's own suspension. Use an ancestor error boundary or route error component. For retry, connect the error boundary reset to `QueryErrorResetBoundary` or `useQueryErrorResetBoundary`. Await critical route data in the loader that owns it. Where useful, prefetch non-critical route data without awaiting it, then let its Suspense consumer read it. Replace wildcard exports with explicit allowed exports. Review actual render ancestry and data criticality. A boundary need not be in the same file. Not every component needs a loader. Loaders also run during client navigation and preloading. Streamed data can finish on the server. Cached-data refetch failures do not always reach an error boundary.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== QUERY_SOURCE || node.importKind === "type") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type !== "ImportSpecifier" ||
            specifier.importKind === "type"
          ) {
            continue;
          }
          const importedName =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value;
          if (importedName !== "useQuery") continue;
          context.report({
            node: specifier,
            messageId: "useSuspenseQuery",
            data: { reference: context.sourceCode.getText(specifier) },
          });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source?.value !== QUERY_SOURCE || node.exportKind === "type") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.exportKind === "type") continue;
          const exportedSourceName =
            specifier.local.type === "Identifier"
              ? specifier.local.name
              : specifier.local.value;
          if (exportedSourceName !== "useQuery") continue;
          context.report({
            node: specifier,
            messageId: "useSuspenseQuery",
            data: {
              reference: `export { ${context.sourceCode.getText(specifier)} }`,
            },
          });
        }
      },
      ExportAllDeclaration(node) {
        if (node.source.value !== QUERY_SOURCE || node.exportKind === "type") {
          return;
        }
        context.report({
          node,
          messageId: "useSuspenseQuery",
          data: {
            reference:
              node.exported == null
                ? "export *"
                : `export * as ${context.sourceCode.getText(node.exported)}`,
          },
        });
      },
      MemberExpression(node) {
        if (
          (getStaticPropertyName(node) ?? getFixedKeyName(node.property)) !==
            "useQuery" ||
          isTypePosition(node) ||
          !isQueryNamespaceReference(node.object, context.sourceCode)
        ) {
          return;
        }
        context.report({
          node,
          messageId: "useSuspenseQuery",
          data: { reference: context.sourceCode.getText(node) },
        });
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== "ObjectPattern" ||
          node.init == null ||
          !isQueryNamespaceReference(node.init, context.sourceCode)
        ) {
          return;
        }
        const hasUseQuery = node.id.properties.some(
          (property) =>
            property.type === "Property" &&
            ((!property.computed &&
              property.key.type === "Identifier" &&
              property.key.name === "useQuery") ||
              getFixedKeyName(property.key) === "useQuery"),
        );
        if (!hasUseQuery) return;
        context.report({
          node,
          messageId: "useSuspenseQuery",
          data: { reference: context.sourceCode.getText(node) },
        });
      },
      AssignmentExpression(node) {
        if (
          node.operator !== "=" ||
          node.left.type !== "ObjectPattern" ||
          !isQueryNamespaceReference(node.right, context.sourceCode)
        ) {
          return;
        }
        const hasUseQuery = node.left.properties.some(
          (property) =>
            property.type === "Property" &&
            ((!property.computed &&
              property.key.type === "Identifier" &&
              property.key.name === "useQuery") ||
              getFixedKeyName(property.key) === "useQuery"),
        );
        if (!hasUseQuery) return;
        context.report({
          node,
          messageId: "useSuspenseQuery",
          data: { reference: context.sourceCode.getText(node) },
        });
      },
    };
  },
});

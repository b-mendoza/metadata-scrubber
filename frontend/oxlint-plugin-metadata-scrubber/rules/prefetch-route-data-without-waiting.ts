import type { Definition, ESTree, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getConstInitializedDeclarator,
  getHttpPropertyName,
  getPatternPath,
  getQueryBindingKind,
  getReferencedVariable,
  getStaticPropertyName,
  isFunction,
  unwrapHttpExpression,
} from "../utilities.ts";

const QUERY_METHODS = new Set([
  "query",
  "fetchQuery",
  "ensureQueryData",
  "prefetchQuery",
  "fetchInfiniteQuery",
  "ensureInfiniteQueryData",
  "prefetchInfiniteQuery",
]);

type Loader = ESTree.ArrowFunctionExpression | ESTree.Function;
interface ContextPathOptions {
  loader: Loader;
  sourceCode: SourceCode;
  seen: Set<Variable>;
}
const EMPTY_DEFINITION_COUNT = 0;

const getLoader = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): Loader | null => {
  let owner: ESTree.Node | null = node.parent;
  while (owner != null && !isFunction(owner)) owner = owner.parent;
  if (owner == null) return null;
  return getRouteLoader(owner, sourceCode);
};

const getQueryLoader = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
): Loader | null => {
  const callee = unwrapHttpExpression(node.callee);
  if (
    callee.type !== "MemberExpression" ||
    !QUERY_METHODS.has(getStaticPropertyName(callee) ?? "")
  ) {
    return null;
  }
  const loader = getLoader(node, sourceCode);
  return loader != null &&
    getContextPath(callee.object, {
      loader,
      sourceCode,
      seen: new Set<Variable>(),
    }) === "input.context.queryClient"
    ? loader
    : null;
};

const getRouteLoader = (
  owner: Loader,
  sourceCode: SourceCode,
): Loader | null => {
  const property = owner.parent;
  if (
    property.type !== "Property" ||
    getHttpPropertyName(property) !== "loader"
  ) {
    return null;
  }
  const options = property.parent;
  if (
    options.type !== "ObjectExpression" ||
    options.parent.type !== "CallExpression"
  ) {
    return null;
  }
  return getQueryBindingKind(options.parent, sourceCode) === "route"
    ? owner
    : null;
};

const getDefinitionPath = (
  definition: Definition,
  options: ContextPathOptions,
): string | null => {
  const [parameter] = options.loader.params;
  if (
    parameter != null &&
    definition.type === "Parameter" &&
    definition.node === options.loader
  ) {
    const path = getPatternPath(definition.name, parameter);
    return path == null ? null : ["input", ...path].join(".");
  }
  const declaration = getConstInitializedDeclarator(definition);
  if (declaration == null) return null;
  const path = getPatternPath(definition.name, declaration.node.id);
  const source = getContextPath(declaration.initializer, options);
  return path == null || source == null ? null : [source, ...path].join(".");
};

const getContextReferencePath = (
  node: Extract<ESTree.Node, { type: "Identifier" }>,
  options: ContextPathOptions,
): string | null => {
  const variable = getReferencedVariable(node, options.sourceCode);
  if (variable == null || options.seen.has(variable)) return null;
  options.seen.add(variable);
  for (const definition of variable.defs) {
    const path = getDefinitionPath(definition, options);
    if (path != null) return path;
  }
  return null;
};

const getContextPath = (
  expression: ESTree.Node,
  options: ContextPathOptions,
): string | null => {
  const node = unwrapHttpExpression(expression);
  if (node.type === "MemberExpression") {
    const source = getContextPath(node.object, options);
    const key = getStaticPropertyName(node);
    return source == null || key == null ? null : `${source}.${key}`;
  }
  return node.type === "Identifier"
    ? getContextReferencePath(node, options)
    : null;
};

const getOuterExpression = (node: ESTree.Node): ESTree.Node => {
  let expression = node;
  let { parent }: { parent: ESTree.Node | null } = expression;
  while (
    parent != null &&
    unwrapHttpExpression(parent) === unwrapHttpExpression(expression)
  ) {
    expression = parent;
    ({ parent } = expression);
  }
  return expression;
};

const getChainedCall = (node: ESTree.Node): ESTree.CallExpression | null => {
  const { parent } = node;
  if (parent?.type !== "MemberExpression" || parent.object !== node) {
    return null;
  }
  return parent.parent.type === "CallExpression" &&
    parent.parent.callee === parent
    ? parent.parent
    : null;
};

const isGlobalUndefined = (
  node: Extract<ESTree.Node, { type: "Identifier" }>,
  sourceCode: SourceCode,
): boolean =>
  node.name === "undefined" &&
  (getReferencedVariable(node, sourceCode)?.defs.length ??
    EMPTY_DEFINITION_COUNT) === EMPTY_DEFINITION_COUNT;

const hasRejectionHandler = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
): boolean => {
  if (getStaticPropertyName(node.callee) !== "catch") return false;
  const [handler] = node.arguments;
  if (handler == null) return false;
  const expression = unwrapHttpExpression(handler);
  if (expression.type === "Literal" && expression.value == null) return false;
  return (
    expression.type !== "Identifier" ||
    !isGlobalUndefined(expression, sourceCode)
  );
};

const getPromiseChain = (
  call: ESTree.CallExpression,
  sourceCode: SourceCode,
) => {
  let expression = getOuterExpression(call);
  let hasCatch = false;
  let chained = getChainedCall(expression);
  while (chained != null) {
    hasCatch ||= hasRejectionHandler(chained, sourceCode);
    expression = getOuterExpression(chained);
    chained = getChainedCall(expression);
  }
  return { expression, hasCatch };
};

const isWaitedExpression = (expression: ESTree.Node, loader: Loader): boolean =>
  expression.parent?.type === "AwaitExpression" ||
  expression.parent?.type === "ReturnStatement" ||
  (loader.type === "ArrowFunctionExpression" && loader.body === expression);

const getAwaitedConstVariable = (
  expression: ESTree.Node,
  sourceCode: SourceCode,
): Variable | undefined => {
  const awaited = expression.parent;
  if (awaited?.type !== "AwaitExpression") return;
  const declaration = awaited.parent;
  if (
    declaration.type !== "VariableDeclarator" ||
    declaration.init !== awaited ||
    declaration.id.type !== "Identifier" ||
    declaration.parent.type !== "VariableDeclaration" ||
    declaration.parent.kind !== "const"
  ) {
    return;
  }
  const [variable] = sourceCode.getDeclaredVariables(declaration);
  return variable;
};

const isNeededByLaterQuery = (
  expression: ESTree.Node,
  loader: Loader,
  sourceCode: SourceCode,
): boolean => {
  const variable = getAwaitedConstVariable(expression, sourceCode);
  const [, queryEnd] = expression.range;
  return (
    variable?.references.some((reference) => {
      if (!reference.isRead()) return false;
      let child: ESTree.Node = reference.identifier;
      let { parent }: { parent: ESTree.Node | null } = child;
      while (parent != null && parent !== loader) {
        const argumentNode = child;
        const [parentStart] = parent.range;
        if (
          parent.type === "CallExpression" &&
          parent.arguments.some((argument) => argument === argumentNode) &&
          parentStart > queryEnd &&
          getQueryLoader(parent, sourceCode) === loader
        ) {
          return true;
        }
        child = parent;
        ({ parent } = child);
      }
      return false;
    }) ?? false
  );
};

const getPromiseUse = (
  call: ESTree.CallExpression,
  loader: Loader,
  sourceCode: SourceCode,
): "wait" | "uncaught" | null => {
  const { expression, hasCatch } = getPromiseChain(call, sourceCode);
  const { parent } = expression;
  if (isWaitedExpression(expression, loader)) {
    return isNeededByLaterQuery(expression, loader, sourceCode) ? null : "wait";
  }
  return !hasCatch &&
    parent?.type === "UnaryExpression" &&
    parent.operator === "void"
    ? "uncaught"
    : null;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Start route queries without waiting and handle discarded query errors.",
    },
    messages: {
      wait: "`{{ reference }}` waits for route query data. Start it without waiting: `void {{ reference }}.catch(() => null)`. Do not return the query promise. Await a route query only when a later optional route query needs its result: assign the result to a `const` and pass it to that later query.",
      uncaught:
        "`{{ reference }}` drops a route query promise without an error handler. Use `void {{ reference }}.catch(() => null)`.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const loader = getQueryLoader(node, sourceCode);
        if (loader == null) return;
        const messageId = getPromiseUse(node, loader, sourceCode);
        if (messageId == null) return;
        context.report({
          node,
          messageId,
          data: { reference: sourceCode.getText(node) },
        });
      },
    };
  },
});

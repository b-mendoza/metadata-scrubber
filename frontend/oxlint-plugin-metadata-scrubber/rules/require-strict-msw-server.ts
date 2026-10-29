import type { Definition, ESTree, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getConstDeclaratorInitializer,
  getReferencedVariable,
  getRuntimeImportDeclaration,
  getStaticPropertyName,
  isFunction,
  isTestFile,
} from "../utilities.ts";

const getImportName = (
  definition: Definition,
  source: string,
): string | null => {
  const declaration = getRuntimeImportDeclaration(definition);
  if (declaration?.source.value !== source) return null;
  if (definition.node.type === "ImportNamespaceSpecifier") return "*";
  if (definition.node.type !== "ImportSpecifier") {
    return null;
  }
  const { imported } = definition.node;
  return imported.type === "Identifier" ? imported.name : imported.value;
};

const getImportedApi = (
  node: ESTree.Node,
  source: string,
  sourceCode: SourceCode,
): string | null => {
  const reference = node.type === "MemberExpression" ? node.object : node;
  if (reference.type !== "Identifier") return null;
  const variable = getReferencedVariable(reference, sourceCode);
  const definition = variable?.defs.find(
    (candidate) => getImportName(candidate, source) != null,
  );
  if (definition == null) return null;
  const imported = getImportName(definition, source);
  if (imported === "*") return getStaticPropertyName(node);
  return node.type === "Identifier" ? imported : null;
};

const getOptionKey = (
  node: ESTree.Node,
  isComputed: boolean,
): string | null => {
  if (!isComputed && node.type === "Identifier") return node.name;
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : null;
};

const isStrictListen = (node: ESTree.CallExpression): boolean => {
  const [options] = node.arguments;
  if (options?.type !== "ObjectExpression") return false;
  // A later spread or dynamic key can override the strict option.
  const lastOption = options.properties.findLast((property) => {
    if (property.type === "SpreadElement") return true;
    const key = getOptionKey(property.key, property.computed);
    return key == null || key === "onUnhandledFrame";
  });
  return (
    lastOption?.type === "Property" &&
    getOptionKey(lastOption.key, lastOption.computed) === "onUnhandledFrame" &&
    lastOption.value.type === "Literal" &&
    lastOption.value.value === "error"
  );
};

const getEnclosingHook = (
  node: ESTree.Node,
  sourceCode: SourceCode,
): string | null => {
  let { parent } = node;
  while (parent != null) {
    if (isFunction(parent)) {
      const call = parent.parent;
      return call.type === "CallExpression" && call.arguments.includes(parent)
        ? getImportedApi(call.callee, "vitest", sourceCode)
        : null;
    }
    ({ parent } = parent);
  }
  return null;
};

const isServerReference = (
  node: ESTree.Node,
  {
    server,
    sourceCode,
    seen = new Set<Variable>(),
  }: {
    server: Variable;
    sourceCode: SourceCode;
    seen?: Set<Variable>;
  },
): boolean => {
  if (node.type !== "Identifier") return false;
  const variable = getReferencedVariable(node, sourceCode);
  if (variable === server) return true;
  if (variable == null || seen.has(variable)) return false;
  seen.add(variable);
  return variable.defs.some((definition) => {
    const initializer = getConstDeclaratorInitializer(definition);
    return (
      initializer != null &&
      isServerReference(initializer, { server, sourceCode, seen })
    );
  });
};

const getLifecycleCalls = (
  calls: ESTree.CallExpression[],
  server: Variable,
  sourceCode: SourceCode,
) => {
  const listens: ESTree.CallExpression[] = [];
  let hasReset = false;
  let hasClose = false;
  const serverCalls = calls.filter(
    (call) =>
      call.callee.type === "MemberExpression" &&
      isServerReference(call.callee.object, { server, sourceCode }),
  );
  for (const call of serverCalls) {
    const method = getStaticPropertyName(call.callee);
    if (method === "listen") listens.push(call);
    else if (method === "resetHandlers") {
      hasReset ||= getEnclosingHook(call, sourceCode) === "afterEach";
    } else if (method === "close") {
      hasClose ||= getEnclosingHook(call, sourceCode) === "afterAll";
    }
  }
  return { listens, hasReset, hasClose };
};

const GUIDANCE =
  'Call `{{ serverName }}.listen({ onUnhandledFrame: "error" })`, `{{ serverName }}.resetHandlers()` inside an `afterEach` callback, and `{{ serverName }}.close()` inside an `afterAll` callback. Import the hooks from `vitest`.';

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require strict MSW interception and test lifecycle cleanup.",
    },
    messages: {
      unboundServer: `\`{{ setupCall }}\` creates an unnamed MSW server. Assign it with \`const server = {{ setupCall }};\`. ${
        GUIDANCE
      }`,
      missingLifecycle: `\`{{ serverName }}\` is missing strict MSW lifecycle calls. ${GUIDANCE}`,
      unsafeListen: `\`{{ serverName }}.listen\` does not set \`onUnhandledFrame\` to \`"error"\`. ${
        GUIDANCE
      }`,
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    const servers = new Map<Variable, ESTree.BindingIdentifier>();
    const calls: ESTree.CallExpression[] = [];
    return {
      CallExpression(node) {
        if (
          getImportedApi(node.callee, "msw/node", context.sourceCode) ===
          "setupServer"
        ) {
          const declaration = node.parent;
          if (
            declaration.type !== "VariableDeclarator" ||
            declaration.id.type !== "Identifier"
          ) {
            context.report({
              node,
              messageId: "unboundServer",
              data: {
                serverName: "server",
                setupCall: context.sourceCode.getText(node),
              },
            });
            return;
          }
          const [variable] =
            context.sourceCode.getDeclaredVariables(declaration);
          if (variable != null) servers.set(variable, declaration.id);
        }
        calls.push(node);
      },
      "Program:exit"() {
        for (const [server, binding] of servers) {
          const { listens, hasReset, hasClose } = getLifecycleCalls(
            calls,
            server,
            context.sourceCode,
          );
          if (
            !hasReset ||
            !hasClose ||
            listens.every((call) => !isStrictListen(call))
          ) {
            context.report({
              node: binding,
              messageId: "missingLifecycle",
              data: { serverName: binding.name },
            });
          }
          for (const call of listens) {
            if (isStrictListen(call)) continue;
            context.report({
              node: call,
              messageId: "unsafeListen",
              data: { serverName: binding.name },
            });
          }
        }
      },
    };
  },
});

import type { ESTree, SourceCode } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getQueryBindingKind } from "../utilities.ts";

const isProviderAttribute = (
  node: ESTree.JSXAttribute,
  sourceCode: SourceCode,
): boolean => {
  if (
    node.parent.type !== "JSXOpeningElement" ||
    node.name.type !== "JSXIdentifier"
  ) {
    return false;
  }
  const kind = getQueryBindingKind(node.parent.name, sourceCode);
  return kind === "trpc-provider"
    ? node.name.name === "queryClient" || node.name.name === "trpcClient"
    : kind === "query-provider" && node.name.name === "client";
};

const getAttributeValue = (node: ESTree.JSXAttribute) =>
  node.value?.type === "JSXExpressionContainer"
    ? node.value.expression
    : node.value;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Read query clients from route context or hooks instead of component props.",
    },
    messages: {
      clientProp:
        "`{{ reference }}` passes a query client through the `{{ attribute }}` prop. In a route file, read `trpc` and `queryClient` with `Route.useRouteContext()`. In a component that lives in its own file, read them with `trpcContext.useTRPC()` and `useQueryClient()` from `@tanstack/react-query`. Remove this prop.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      JSXAttribute(node) {
        if (isProviderAttribute(node, sourceCode)) return;
        const attribute = sourceCode.getText(node.name);
        const value = getAttributeValue(node);
        const kind =
          value == null ? null : getQueryBindingKind(value, sourceCode);
        if (
          attribute !== "trpc" &&
          attribute !== "queryClient" &&
          kind !== "trpc" &&
          kind !== "query-client"
        ) {
          return;
        }
        context.report({
          node,
          messageId: "clientProp",
          data: {
            attribute,
            reference: sourceCode.getText(value ?? node.name),
          },
        });
      },
    };
  },
});

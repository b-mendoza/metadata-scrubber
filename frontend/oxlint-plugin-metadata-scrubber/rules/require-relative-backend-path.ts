import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getHttpRequestKind,
  getTemplatePrefix,
  isServerModule,
  isTestFile,
  unwrapHttpExpression,
} from "../utilities.ts";

const hasRelativePath = (argument: ESTree.Node | undefined): boolean => {
  if (argument == null) return false;
  const path = unwrapHttpExpression(argument);
  if (path.type === "TemplateLiteral") {
    return isRelativePrefix(getTemplatePrefix(path));
  }
  return (
    path.type === "Literal" &&
    typeof path.value === "string" &&
    isRelativePrefix(path.value)
  );
};

const isRelativePrefix = (text: string | null): boolean =>
  text != null &&
  text.startsWith("/") &&
  !text.startsWith("//") &&
  !text.startsWith("/\\");

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require relative backend paths after app bindings set the base URL.",
    },
    messages: {
      relativePath:
        '`{{ source }}` must use a path that starts with a single `/`. App bindings set the base URL; pass a relative path such as `"/api/health"` as the first argument.',
    },
  },
  create(context) {
    if (
      isTestFile(context.filename) ||
      !isServerModule(context.filename, context.cwd)
    ) {
      return {};
    }
    return {
      CallExpression(node) {
        if (getHttpRequestKind(node, context.sourceCode) !== "backend-client") {
          return;
        }
        const [argument] = node.arguments;
        if (hasRelativePath(argument)) return;
        context.report({
          node,
          messageId: "relativePath",
          data: {
            source: context.sourceCode
              .getText(node.callee)
              .replaceAll(/\s+/gv, ""),
          },
        });
      },
    };
  },
});

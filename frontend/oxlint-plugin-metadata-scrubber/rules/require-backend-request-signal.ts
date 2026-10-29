import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getHttpPropertyName,
  getHttpRequestKind,
  isServerModule,
  isTestFile,
  unwrapHttpExpression,
} from "../utilities.ts";

const hasFinalSignal = (options: ESTree.ObjectExpression): boolean => {
  let hasSignal = false;
  for (const property of options.properties) {
    if (property.type === "SpreadElement") {
      hasSignal = false;
      continue;
    }
    const name = getHttpPropertyName(property);
    if (name == null || name === "signal") hasSignal = name === "signal";
  }
  return hasSignal;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an explicit cancellation signal on backend requests.",
    },
    messages: {
      missingSignal:
        "`{{ source }}` must pass an options object literal with an explicit `signal` property after all spreads. Pass the request AbortSignal as `{ signal: signal ?? null }` so request cancellation stops the backend call.",
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
        const [, argument] = node.arguments;
        const options =
          argument == null ? null : unwrapHttpExpression(argument);
        if (options?.type === "ObjectExpression" && hasFinalSignal(options)) {
          return;
        }
        context.report({
          node,
          messageId: "missingSignal",
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

import { defineRule } from "@oxlint/plugins";

import { getHttpBindingKind, isFunction, isTestFile } from "../utilities.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Keep HTTP client creation inside request scope." },
    messages: {
      moduleClient:
        "`{{ source }}` creates an HTTP client at module scope. Create clients in `appBindingsMiddleware` for each request and read them with `getAppBindings()`.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) return {};
    return {
      CallExpression(node) {
        if (getHttpBindingKind(node.callee, context.sourceCode) !== "factory") {
          return;
        }
        let { parent } = node;
        while (parent.type !== "Program") {
          if (isFunction(parent)) return;
          ({ parent } = parent);
        }
        context.report({
          node,
          messageId: "moduleClient",
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

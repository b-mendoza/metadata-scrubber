import { defineRule } from "@oxlint/plugins";

import {
  getHttpRequestKind,
  getStaticPropertyName,
  unwrapHttpExpression,
} from "../utilities.ts";

const EMPTY_ARGUMENT_COUNT = 0;

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require a response schema on Ky JSON requests." },
    messages: {
      missingSchema:
        "`{{ source }}` calls `.json()` without a response schema. Pass the Zod response schema with `.json(schema)`. Ky validates the body; do not parse it again later.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = unwrapHttpExpression(node.callee);
        if (
          callee.type !== "MemberExpression" ||
          getStaticPropertyName(callee) !== "json" ||
          node.arguments.length > EMPTY_ARGUMENT_COUNT
        ) {
          return;
        }
        const request = unwrapHttpExpression(callee.object);
        if (
          request.type !== "CallExpression" ||
          getHttpRequestKind(request, context.sourceCode) == null
        ) {
          return;
        }
        context.report({
          node,
          messageId: "missingSchema",
          data: {
            source: context.sourceCode
              .getText(request.callee)
              .replaceAll(/\s+/gv, ""),
          },
        });
      },
    };
  },
});

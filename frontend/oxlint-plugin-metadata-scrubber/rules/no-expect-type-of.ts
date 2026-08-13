import { defineRule } from "@oxlint/plugins";

import { isIdentifier, isTestFile } from "../utils.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow expectTypeOf in tests.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};

    return {
      CallExpression(node) {
        if (!isIdentifier(node.callee, "expectTypeOf")) return;
        context.report({
          node,
          message:
            "Use TypeScript annotations instead of re-testing static types with expectTypeOf.",
        });
      },
    };
  },
});

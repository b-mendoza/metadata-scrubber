import { defineRule } from "@oxlint/plugins";

import { isServerModule } from "../utils.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow top-level mutable variables in server modules.",
    },
  },
  create(context) {
    if (!isServerModule(context.filename, context.cwd)) return {};

    return {
      VariableDeclaration(node) {
        const isTopLevel =
          node.parent.type === "Program" ||
          (node.parent.type === "ExportNamedDeclaration" &&
            node.parent.parent.type === "Program");
        if ((node.kind !== "let" && node.kind !== "var") || !isTopLevel) return;
        context.report({
          node,
          message:
            "Keep mutable request state inside the request scope. Use const for immutable module values.",
        });
      },
    };
  },
});

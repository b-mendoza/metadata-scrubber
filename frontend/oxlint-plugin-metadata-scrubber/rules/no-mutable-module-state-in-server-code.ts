import { defineRule } from "@oxlint/plugins";

import { isServerModule } from "../utilities.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow top-level mutable variables in server modules.",
    },
    messages: {
      mutableModuleState:
        "Concurrent server requests share the module-scope `{{ declarationKind }}` state in `{{ bindings }}`. Move request-local mutation into request scope. Put request dependencies in `applicationBindingsMiddleware` and read them with `getApplicationBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.",
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
        const bindings = node.declarations
          .map((declaration) => context.sourceCode.getText(declaration.id))
          .join(", ");
        context.report({
          node,
          messageId: "mutableModuleState",
          data: {
            bindings,
            declarationKind: node.kind,
          },
        });
      },
    };
  },
});

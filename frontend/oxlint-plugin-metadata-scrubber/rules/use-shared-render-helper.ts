import { defineRule } from "@oxlint/plugins";

import { isTestFile } from "../utils.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require the shared render helper in tests.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@testing-library/react") return;
        const renderSpecifier = node.specifiers.find(
          (specifier) =>
            specifier.type === "ImportSpecifier" &&
            ((specifier.imported.type === "Identifier" &&
              specifier.imported.name === "render") ||
              (specifier.imported.type === "Literal" &&
                specifier.imported.value === "render")),
        );
        if (renderSpecifier === undefined) return;
        context.report({
          node: renderSpecifier,
          message:
            "Use renderComponent from #/tests/utils/renderers/renderers.mod.",
        });
      },
    };
  },
});

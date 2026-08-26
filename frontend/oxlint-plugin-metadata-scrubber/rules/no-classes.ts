import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

const getClassName = (node: ESTree.Class): string => {
  if (node.id != null) return node.id.name;
  const { parent } = node;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  return "anonymous class";
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require plain functions and objects instead of class declarations and class expressions.",
    },
    messages: {
      classSyntax:
        "`{{ className }}` uses class syntax. Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. Plain functions and objects keep dependencies and mutable state explicit. The rule has no class exceptions, including classes that extend `Error`.",
    },
  },
  create(context) {
    const checkClass = (node: ESTree.Class): void => {
      context.report({
        node,
        messageId: "classSyntax",
        data: { className: getClassName(node) },
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

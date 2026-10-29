import { defineRule } from "@oxlint/plugins";

import { isTestFile } from "../utilities.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require schema-derived imports instead of test-local object types.",
    },
    messages: {
      localObjectType:
        "`{{ typeName }}` declares a test-local object type. Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSTypeLiteral") return;
        context.report({
          node,
          messageId: "localObjectType",
          data: { typeName: node.id.name },
        });
      },
      TSInterfaceDeclaration(node) {
        context.report({
          node,
          messageId: "localObjectType",
          data: { typeName: node.id.name },
        });
      },
    };
  },
});

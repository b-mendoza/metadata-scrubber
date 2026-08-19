import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utils.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/env.mod.server.ts";
const HTTP_HOST = /^https?:\/\//u;
const NO_EXPRESSIONS = 0;

const getStaticTemplateText = (
  node: ESTree.TemplateLiteral,
): string | undefined => {
  if (node.expressions.length !== NO_EXPRESSIONS) return undefined;
  const [quasi] = node.quasis;
  if (quasi === undefined) return undefined;
  return quasi.value.cooked ?? quasi.value.raw;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded HTTP hosts outside tests and the validated environment module.",
    },
  },
  create(context) {
    const exempt =
      isTestFile(context.filename) ||
      toProjectPath(context.filename, context.cwd) === ENVIRONMENT_MODULE;
    if (exempt) return {};

    return {
      Literal(node) {
        if (typeof node.value !== "string" || !HTTP_HOST.test(node.value)) {
          return;
        }
        context.report({
          node,
          message:
            "Read the backend URL from the validated environment module.",
        });
      },
      TemplateLiteral(node) {
        const staticText = getStaticTemplateText(node);
        if (staticText === undefined || !HTTP_HOST.test(staticText)) return;
        context.report({
          node,
          message:
            "Read the backend URL from the validated environment module.",
        });
      },
    };
  },
});

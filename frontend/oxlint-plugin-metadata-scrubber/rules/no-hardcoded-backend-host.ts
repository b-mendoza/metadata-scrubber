import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utils.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/env.mod.server.ts";

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
        if (
          typeof node.value !== "string" ||
          !/^https?:\/\//u.test(node.value)
        ) {
          return;
        }
        context.report({
          node,
          message:
            "Read the backend URL from the validated environment module.",
        });
      },
    };
  },
});

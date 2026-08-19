import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utils.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/env.mod.server.ts";
const NO_EXPRESSIONS = 0;
const STATIC_HTTP_HOST = /^https?:\/\/[^/?#\s]+/iu;
const STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY = /^https?:\/\/[^/?#\s]+[/?#]/iu;

const getFirstTemplateText = (
  node: ESTree.TemplateLiteral,
): string | undefined => {
  const [quasi] = node.quasis;
  if (quasi === undefined) return undefined;
  return quasi.value.cooked ?? quasi.value.raw;
};

const templateStartsWithStaticHost = (
  node: ESTree.TemplateLiteral,
  firstTemplateText: string,
): boolean =>
  node.expressions.length === NO_EXPRESSIONS
    ? STATIC_HTTP_HOST.test(firstTemplateText)
    : STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY.test(firstTemplateText);

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded HTTP hosts outside tests and the validated environment module.",
    },
    messages: {
      staticServiceHost:
        "`{{ url }}` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getApplicationBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
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
          !STATIC_HTTP_HOST.test(node.value)
        ) {
          return;
        }
        context.report({
          node,
          messageId: "staticServiceHost",
          data: { url: node.value },
        });
      },
      TemplateLiteral(node) {
        const firstTemplateText = getFirstTemplateText(node);
        if (
          firstTemplateText === undefined ||
          !templateStartsWithStaticHost(node, firstTemplateText)
        ) {
          return;
        }
        context.report({
          node,
          messageId: "staticServiceHost",
          data: { url: firstTemplateText },
        });
      },
    };
  },
});

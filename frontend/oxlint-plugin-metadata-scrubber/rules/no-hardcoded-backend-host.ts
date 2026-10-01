import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utilities.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/environment.mod.server.ts";
const NO_EXPRESSIONS = 0;
const STATIC_HTTP_HOST = /^https?:\/\/[^\/?#\s]+/iv;
const STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY =
  /^https?:\/\/[^\/?#\s]+[\/?#]/iv;
const STATIC_HTTP_PROTOCOLS = new Set(["http", "http:", "https", "https:"]);

const getFirstTemplateText = (
  node: ESTree.TemplateLiteral,
): string | undefined => {
  const [quasi] = node.quasis;
  if (quasi == null) return;
  return quasi.value.cooked ?? quasi.value.raw;
};

const hasStaticHostPrefix = (
  text: string,
  hasLaterExpression: boolean,
): boolean =>
  hasLaterExpression
    ? STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY.test(text)
    : STATIC_HTTP_HOST.test(text);

type TransparentExpression =
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression;

const isTransparentExpression = (
  expression: ESTree.Expression,
): expression is TransparentExpression =>
  [
    "TSInstantiationExpression",
    "TSAsExpression",
    "TSSatisfiesExpression",
    "TSNonNullExpression",
    "ParenthesizedExpression",
  ].includes(expression.type);

const unwrapTransparentExpressions = (
  expression: ESTree.Expression,
): ESTree.Expression => {
  let unwrappedExpression = expression;
  while (isTransparentExpression(unwrappedExpression)) {
    unwrappedExpression = unwrappedExpression.expression;
  }
  return unwrappedExpression;
};

const getHttpProtocolLiteral = (
  expression: ESTree.Expression,
): string | null => {
  const literal = unwrapTransparentExpressions(expression);
  if (literal.type !== "Literal" || typeof literal.value !== "string") {
    return null;
  }
  return STATIC_HTTP_PROTOCOLS.has(literal.value.toLowerCase())
    ? literal.value
    : null;
};

const getConstHttpProtocol = (variable: Variable): string | null => {
  for (const definition of variable.defs) {
    if (
      definition.type !== "Variable" ||
      definition.node.type !== "VariableDeclarator" ||
      definition.parent?.type !== "VariableDeclaration" ||
      definition.parent.kind !== "const" ||
      definition.node.init == null
    ) {
      continue;
    }
    return getHttpProtocolLiteral(definition.node.init);
  }
  return null;
};

const getStaticHttpProtocol = (
  expression: ESTree.Expression,
  sourceCode: SourceCode,
): string | null => {
  const unwrappedExpression = unwrapTransparentExpressions(expression);
  if (unwrappedExpression.type !== "Identifier") {
    return getHttpProtocolLiteral(unwrappedExpression);
  }

  let scope: Scope | null = sourceCode.getScope(unwrappedExpression);
  while (scope != null) {
    const variable = scope.set.get(unwrappedExpression.name);
    if (variable != null) return getConstHttpProtocol(variable);
    scope = scope.upper;
  }
  return null;
};

const getInterpolatedProtocolUrl = (
  node: ESTree.TemplateLiteral,
  sourceCode: SourceCode,
): string | undefined => {
  if (getFirstTemplateText(node) !== "") return;
  const [firstExpression, laterExpression] = node.expressions;
  const [, nextQuasi] = node.quasis;
  if (firstExpression == null || nextQuasi == null) return;
  const protocol = getStaticHttpProtocol(firstExpression, sourceCode);
  if (protocol == null) return;
  const nextTemplateText = nextQuasi.value.cooked ?? nextQuasi.value.raw;
  const url = `${protocol}${nextTemplateText}`;
  if (!hasStaticHostPrefix(url, laterExpression != null)) return;
  return url;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded HTTP hosts outside tests and the validated environment module.",
    },
    messages: {
      staticServiceHost:
        "`{{ url }}` contains a static HTTP service host. Service hosts vary by deployment, so this source text can target the wrong environment. For the backend base URL in server code, read `env.BACKEND_URL` through `getAppBindings()` and build `new URL(path, env.BACKEND_URL)`. Browser code must call a frontend server route for backend access. For another service host, add a validated environment field.",
    },
  },
  create(context) {
    const isExempt =
      isTestFile(context.filename) ||
      toProjectPath(context.filename, context.cwd) === ENVIRONMENT_MODULE;
    if (isExempt) return {};

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
        const url =
          firstTemplateText != null &&
          hasStaticHostPrefix(
            firstTemplateText,
            node.expressions.length !== NO_EXPRESSIONS,
          )
            ? firstTemplateText
            : getInterpolatedProtocolUrl(node, context.sourceCode);
        if (url == null) return;
        context.report({
          node,
          messageId: "staticServiceHost",
          data: { url },
        });
      },
    };
  },
});

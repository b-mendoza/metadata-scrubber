import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utilities.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/environment.mod.server.ts";
const NO_EXPRESSIONS = 0;
const STATIC_HTTP_AUTHORITY = /^:\/\/[^/?#\s]+/u;
const STATIC_HTTP_AUTHORITY_AFTER_PROTOCOL_COLON = /^\/\/[^/?#\s]+/u;
const STATIC_HTTP_AUTHORITY_AFTER_PROTOCOL_COLON_WITH_BOUNDARY =
  /^\/\/[^/?#\s]+[/?#]/u;
const STATIC_HTTP_AUTHORITY_WITH_BOUNDARY = /^:\/\/[^/?#\s]+[/?#]/u;
const STATIC_HTTP_HOST = /^https?:\/\/[^/?#\s]+/iu;
const STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY = /^https?:\/\/[^/?#\s]+[/?#]/iu;
const STATIC_HTTP_PROTOCOLS = new Set(["http", "http:", "https", "https:"]);

const getFirstTemplateText = (
  node: ESTree.TemplateLiteral,
): string | undefined => {
  const [quasi] = node.quasis;
  if (quasi == null) return;
  return quasi.value.cooked ?? quasi.value.raw;
};

const templateStartsWithStaticHost = (
  node: ESTree.TemplateLiteral,
  firstTemplateText: string,
): boolean =>
  node.expressions.length === NO_EXPRESSIONS
    ? STATIC_HTTP_HOST.test(firstTemplateText)
    : STATIC_HTTP_HOST_WITH_AUTHORITY_BOUNDARY.test(firstTemplateText);

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
  const literalProtocol = getHttpProtocolLiteral(unwrappedExpression);
  if (literalProtocol != null) return literalProtocol;
  if (unwrappedExpression.type !== "Identifier") return null;

  let scope: Scope | null = sourceCode.getScope(unwrappedExpression);
  while (scope != null) {
    const variable = scope.set.get(unwrappedExpression.name);
    if (variable != null) return getConstHttpProtocol(variable);
    scope = scope.upper;
  }
  return null;
};

interface InterpolatedProtocolTemplate {
  readonly firstExpression: ESTree.Expression;
  readonly hasLaterExpression: boolean;
  readonly nextTemplateText: string;
}

const getInterpolatedProtocolTemplate = (
  node: ESTree.TemplateLiteral,
): InterpolatedProtocolTemplate | undefined => {
  const [firstQuasi, nextQuasi] = node.quasis;
  if (firstQuasi == null) return;
  if ((firstQuasi.value.cooked ?? firstQuasi.value.raw) !== "") return;
  const [firstExpression, laterExpression] = node.expressions;
  if (firstExpression == null) return;
  if (nextQuasi == null) return;
  return {
    firstExpression,
    hasLaterExpression: laterExpression != null,
    nextTemplateText: nextQuasi.value.cooked ?? nextQuasi.value.raw,
  };
};

const getStaticHttpAuthorityPattern = (
  protocol: string,
  hasLaterExpression: boolean,
): RegExp => {
  if (protocol.endsWith(":")) {
    return hasLaterExpression
      ? STATIC_HTTP_AUTHORITY_AFTER_PROTOCOL_COLON_WITH_BOUNDARY
      : STATIC_HTTP_AUTHORITY_AFTER_PROTOCOL_COLON;
  }
  return hasLaterExpression
    ? STATIC_HTTP_AUTHORITY_WITH_BOUNDARY
    : STATIC_HTTP_AUTHORITY;
};

const getInterpolatedProtocolUrl = (
  node: ESTree.TemplateLiteral,
  sourceCode: SourceCode,
): string | undefined => {
  const template = getInterpolatedProtocolTemplate(node);
  if (template == null) return;
  const protocol = getStaticHttpProtocol(template.firstExpression, sourceCode);
  if (protocol == null) return;
  const authorityPattern = getStaticHttpAuthorityPattern(
    protocol,
    template.hasLaterExpression,
  );
  if (!authorityPattern.test(template.nextTemplateText)) return;
  return `${protocol}${template.nextTemplateText}`;
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
        const url =
          firstTemplateText != null &&
          templateStartsWithStaticHost(node, firstTemplateText)
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

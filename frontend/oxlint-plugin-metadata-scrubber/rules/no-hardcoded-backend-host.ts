import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utils.ts";

const ENVIRONMENT_MODULE = "src/shared/config/env/env.mod.server.ts";
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

type TransparentExpression =
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression;

const isTransparentExpression = (
  expression: ESTree.Expression,
): expression is TransparentExpression =>
  expression.type === "TSInstantiationExpression" ||
  expression.type === "TSAsExpression" ||
  expression.type === "TSSatisfiesExpression" ||
  expression.type === "TSNonNullExpression" ||
  expression.type === "ParenthesizedExpression";

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
): string | undefined => {
  const literal = unwrapTransparentExpressions(expression);
  if (literal.type !== "Literal" || typeof literal.value !== "string") {
    return undefined;
  }
  return STATIC_HTTP_PROTOCOLS.has(literal.value.toLowerCase())
    ? literal.value
    : undefined;
};

const getConstHttpProtocol = (variable: Variable): string | undefined => {
  for (const definition of variable.defs) {
    if (
      definition.type !== "Variable" ||
      definition.node.type !== "VariableDeclarator" ||
      definition.parent?.type !== "VariableDeclaration" ||
      definition.parent.kind !== "const" ||
      definition.node.init === null
    ) {
      continue;
    }
    return getHttpProtocolLiteral(definition.node.init);
  }
  return undefined;
};

const getStaticHttpProtocol = (
  expression: ESTree.Expression,
  sourceCode: SourceCode,
): string | undefined => {
  const unwrappedExpression = unwrapTransparentExpressions(expression);
  const literalProtocol = getHttpProtocolLiteral(unwrappedExpression);
  if (literalProtocol !== undefined) return literalProtocol;
  if (unwrappedExpression.type !== "Identifier") return undefined;

  let scope: Scope | null = sourceCode.getScope(unwrappedExpression);
  while (scope !== null) {
    const variable = scope.set.get(unwrappedExpression.name);
    if (variable !== undefined) return getConstHttpProtocol(variable);
    scope = scope.upper;
  }
  return undefined;
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
  if (firstQuasi === undefined) return undefined;
  if ((firstQuasi.value.cooked ?? firstQuasi.value.raw) !== "") {
    return undefined;
  }
  const [firstExpression, laterExpression] = node.expressions;
  if (firstExpression === undefined) return undefined;
  if (nextQuasi === undefined) return undefined;
  return {
    firstExpression,
    hasLaterExpression: laterExpression !== undefined,
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
  if (template === undefined) return undefined;
  const protocol = getStaticHttpProtocol(template.firstExpression, sourceCode);
  if (protocol === undefined) return undefined;
  const authorityPattern = getStaticHttpAuthorityPattern(
    protocol,
    template.hasLaterExpression,
  );
  return authorityPattern.test(template.nextTemplateText)
    ? `${protocol}${template.nextTemplateText}`
    : undefined;
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
          firstTemplateText !== undefined &&
          templateStartsWithStaticHost(node, firstTemplateText)
            ? firstTemplateText
            : getInterpolatedProtocolUrl(node, context.sourceCode);
        if (url === undefined) return;
        context.report({
          node,
          messageId: "staticServiceHost",
          data: { url },
        });
      },
    };
  },
});

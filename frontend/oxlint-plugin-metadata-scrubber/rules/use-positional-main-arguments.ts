import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

const COMPONENT_NAME_PATTERN = /^[A-Z]/u;
const MINIMUM_REQUIRED_PROPERTIES = 2;
const SINGLE_PARAMETER_COUNT = 1;

type CheckedFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

const getFunctionName = (node: CheckedFunction): string => {
  const { parent } = node;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  return node.id?.name ?? "anonymous";
};

const isComponentName = (functionName: string): boolean =>
  COMPONENT_NAME_PATTERN.test(functionName);

const getInlineObjectType = (
  parameter: ESTree.ParamPattern,
): ESTree.TSTypeLiteral | null => {
  if (parameter.type === "TSParameterProperty") return null;
  const typeAnnotation = parameter.typeAnnotation?.typeAnnotation;
  return typeAnnotation?.type === "TSTypeLiteral" ? typeAnnotation : null;
};

const hasMultipleRequiredProperties = (
  typeLiteral: ESTree.TSTypeLiteral,
): boolean =>
  typeLiteral.members.filter(
    (member) => member.type === "TSPropertySignature" && !member.optional,
  ).length >= MINIMUM_REQUIRED_PROPERTIES;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep the main function arguments positional before a trailing options object.",
    },
    messages: {
      collapsedMainArguments:
        "The `{{ functionName }}` function takes every value in one object parameter. This shape hides the main arguments and makes each call site harder to read. Keep at most 2 required arguments positional. Move supplementary values into a trailing options object. For example, change `(options: { path: string; start: number; suffix: string })` to `(path: string, options: { start: number; suffix: string })`.",
    },
  },
  create(context) {
    const checkFunction = (node: CheckedFunction): void => {
      if (node.params.length !== SINGLE_PARAMETER_COUNT) return;
      const [parameter] = node.params;
      if (parameter == null) return;
      const functionName = getFunctionName(node);
      if (isComponentName(functionName)) return;
      const typeLiteral = getInlineObjectType(parameter);
      if (typeLiteral == null || !hasMultipleRequiredProperties(typeLiteral)) {
        return;
      }
      context.report({
        node: parameter,
        messageId: "collapsedMainArguments",
        data: { functionName },
      });
    };

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
    };
  },
});

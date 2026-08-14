import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getStaticPropertyName,
  isIdentifier,
  isServerModule,
} from "../utils.ts";

const COMPILER_NAME = /^(?:is|asserts|decode.*|encode.*)$/u;
const FUNCTION_DEPTH_STEP = 1;
const MODULE_SCOPE_FUNCTION_DEPTH = 0;

const getSchemaCompiler = (
  node: ESTree.CallExpression,
): ESTree.MemberExpression | undefined => {
  if (node.callee.type !== "CallExpression") return undefined;
  const compilerCallee = node.callee.callee;
  if (compilerCallee.type !== "MemberExpression") return undefined;
  if (!isIdentifier(compilerCallee.object, "Schema")) return undefined;
  const propertyName = getStaticPropertyName(compilerCallee);
  return propertyName !== undefined && COMPILER_NAME.test(propertyName)
    ? compilerCallee
    : undefined;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require Effect Schema compiler creation at module scope.",
    },
  },
  create(context) {
    if (!isServerModule(context.filename, context.cwd)) return {};

    let functionDepth = MODULE_SCOPE_FUNCTION_DEPTH;
    const enterFunction = (): void => {
      functionDepth += FUNCTION_DEPTH_STEP;
    };
    const exitFunction = (): void => {
      functionDepth -= FUNCTION_DEPTH_STEP;
    };

    return {
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      CallExpression(node) {
        if (functionDepth === MODULE_SCOPE_FUNCTION_DEPTH) return;
        const compiler = getSchemaCompiler(node);
        if (compiler === undefined) return;
        context.report({
          node: compiler,
          message:
            "Compile the Effect Schema decoder, encoder, assertion, or guard at module scope, then call the compiled function here.",
        });
      },
    };
  },
});

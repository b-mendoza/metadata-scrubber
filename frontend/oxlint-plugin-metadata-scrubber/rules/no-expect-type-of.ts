import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isTestFile } from "../utilities.ts";

const NO_DEFINITIONS = 0;

const getImportedName = (specifier: ESTree.ImportSpecifier): string | null => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : null;
};

const isVitestExpectTypeOfImportDefinition = (
  definition: Definition,
): boolean =>
  definition.type === "ImportBinding" &&
  definition.node.type === "ImportSpecifier" &&
  definition.node.importKind !== "type" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === "vitest" &&
  getImportedName(definition.node) === "expectTypeOf";

const isVitestExpectTypeOfImport = (variable: Variable): boolean =>
  variable.defs.some(isVitestExpectTypeOfImportDefinition);

const isVitestExpectTypeOfReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): boolean => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const variable = scope.set.get(node.name);
    if (variable != null) {
      return variable.defs.length === NO_DEFINITIONS
        ? node.name === "expectTypeOf"
        : isVitestExpectTypeOfImport(variable);
    }
    scope = scope.upper;
  }
  return node.name === "expectTypeOf";
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow expectTypeOf in tests.",
    },
    messages: {
      staticTypeAssertion:
        "`{{ testApi }}(...)` tests a static type. Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (!isVitestExpectTypeOfReference(node.callee, context.sourceCode)) {
          return;
        }
        context.report({
          node,
          messageId: "staticTypeAssertion",
          data: { testApi: node.callee.name },
        });
      },
    };
  },
});

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isTestFile } from "../utilities.ts";

const TESTING_LIBRARY_SOURCES = new Set([
  "@testing-library/react",
  "@testing-library/react/pure",
]);

const getImportedName = (specifier: ESTree.ImportSpecifier): string => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return imported.value;
};

const getTestingLibraryNamespaceImportSource = (
  variable: Variable,
): string | null => {
  for (const definition of variable.defs) {
    if (
      definition.type !== "ImportBinding" ||
      definition.node.type !== "ImportNamespaceSpecifier" ||
      definition.parent?.type !== "ImportDeclaration" ||
      definition.parent.importKind === "type"
    ) {
      continue;
    }
    const source = definition.parent.source.value;
    if (TESTING_LIBRARY_SOURCES.has(source)) return source;
  }
  return null;
};

const getTestingLibraryNamespaceReferenceSource = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): string | null => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const variable = scope.set.get(node.name);
    if (variable != null) {
      return getTestingLibraryNamespaceImportSource(variable);
    }
    scope = scope.upper;
  }
  return null;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require the shared render helper in tests.",
    },
    messages: {
      directTestingLibraryRender:
        "Do not use `{{ renderReference }}` from the `{{ source }}` package directly. Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};

    return {
      ImportDeclaration(node) {
        if (!TESTING_LIBRARY_SOURCES.has(node.source.value)) return;
        if (node.importKind === "type") return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type !== "ImportSpecifier" ||
            specifier.importKind === "type" ||
            getImportedName(specifier) !== "render"
          ) {
            continue;
          }
          context.report({
            node: specifier,
            messageId: "directTestingLibraryRender",
            data: {
              renderReference: specifier.local.name,
              source: node.source.value,
            },
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.object.type !== "Identifier" ||
          getStaticPropertyName(node.callee) !== "render"
        ) {
          return;
        }
        const source = getTestingLibraryNamespaceReferenceSource(
          node.callee.object,
          context.sourceCode,
        );
        if (source == null) return;
        context.report({
          node: node.callee,
          messageId: "directTestingLibraryRender",
          data: {
            renderReference: context.sourceCode.getText(node.callee),
            source,
          },
        });
      },
    };
  },
});

import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isTestFile } from "../utils.ts";

const TESTING_LIBRARY_SOURCE = "@testing-library/react";

const getImportedName = (
  specifier: ESTree.ImportSpecifier,
): string | undefined => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : undefined;
};

const isRuntimeRenderImportSpecifier = (
  specifier: ESTree.ImportDeclaration["specifiers"][number],
  declaration: ESTree.ImportDeclaration,
): specifier is ESTree.ImportSpecifier =>
  declaration.importKind !== "type" &&
  specifier.type === "ImportSpecifier" &&
  specifier.importKind !== "type" &&
  getImportedName(specifier) === "render";

const isTestingLibraryNamespaceImportDefinition = (
  definition: Definition,
): boolean =>
  definition.type === "ImportBinding" &&
  definition.node.type === "ImportNamespaceSpecifier" &&
  definition.parent?.type === "ImportDeclaration" &&
  definition.parent.importKind !== "type" &&
  definition.parent.source.value === TESTING_LIBRARY_SOURCE;

const isTestingLibraryNamespaceImport = (variable: Variable): boolean =>
  variable.defs.some(isTestingLibraryNamespaceImportDefinition);

const isTestingLibraryNamespaceReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): boolean => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      return isTestingLibraryNamespaceImport(variable);
    }
    scope = scope.upper;
  }
  return false;
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
        if (node.source.value !== TESTING_LIBRARY_SOURCE) return;
        const renderSpecifier = node.specifiers.find((specifier) =>
          isRuntimeRenderImportSpecifier(specifier, node),
        );
        if (renderSpecifier === undefined) return;
        context.report({
          node: renderSpecifier,
          messageId: "directTestingLibraryRender",
          data: {
            renderReference: renderSpecifier.local.name,
            source: node.source.value,
          },
        });
      },
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.object.type !== "Identifier" ||
          getStaticPropertyName(node.callee) !== "render" ||
          !isTestingLibraryNamespaceReference(
            node.callee.object,
            context.sourceCode,
          )
        ) {
          return;
        }
        context.report({
          node: node.callee,
          messageId: "directTestingLibraryRender",
          data: {
            renderReference: context.sourceCode.getText(node.callee),
            source: TESTING_LIBRARY_SOURCE,
          },
        });
      },
    };
  },
});

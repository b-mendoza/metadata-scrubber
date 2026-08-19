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
const TESTING_LIBRARY_PURE_SOURCE = "@testing-library/react/pure";
const TESTING_LIBRARY_SOURCES = new Set([
  TESTING_LIBRARY_SOURCE,
  TESTING_LIBRARY_PURE_SOURCE,
]);

const isTestingLibrarySource = (source: string): boolean =>
  TESTING_LIBRARY_SOURCES.has(source);

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

const getTestingLibraryNamespaceImportSourceFromDefinition = (
  definition: Definition,
): string | undefined => {
  if (
    definition.type !== "ImportBinding" ||
    definition.node.type !== "ImportNamespaceSpecifier" ||
    definition.parent?.type !== "ImportDeclaration" ||
    definition.parent.importKind === "type"
  ) {
    return undefined;
  }
  const source = definition.parent.source.value;
  return isTestingLibrarySource(source) ? source : undefined;
};

const getTestingLibraryNamespaceImportSource = (
  variable: Variable,
): string | undefined => {
  for (const definition of variable.defs) {
    const source =
      getTestingLibraryNamespaceImportSourceFromDefinition(definition);
    if (source !== undefined) return source;
  }
  return undefined;
};

const getTestingLibraryNamespaceReferenceSource = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): string | undefined => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      return getTestingLibraryNamespaceImportSource(variable);
    }
    scope = scope.upper;
  }
  return undefined;
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
        if (!isTestingLibrarySource(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (!isRuntimeRenderImportSpecifier(specifier, node)) continue;
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
        if (source === undefined) return;
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

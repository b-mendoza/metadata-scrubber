import { defineRule } from "@oxlint/plugins";

const NO_TYPE_BINDINGS = 0;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require separate declarations for type imports.",
    },
    messages: {
      inlineTypeImport:
        'Move inline type bindings `{{ bindings }}` from `{{ module }}` to a separate `import type` declaration. Preserve each imported name and local alias. Keep runtime bindings in a separate import declaration. Type imports disappear from JavaScript. If no runtime import remains, keep a side-effect import when module initialization is required. Ky example: `import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";` and `import ky, { HTTPError } from "ky";`.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;

        const bindings: string[] = [];
        for (const specifier of node.specifiers) {
          if (
            specifier.type !== "ImportSpecifier" ||
            specifier.importKind !== "type"
          ) {
            continue;
          }

          const importedName = context.sourceCode.getText(specifier.imported);
          const localName = specifier.local.name;
          bindings.push(
            importedName === localName
              ? importedName
              : `${importedName} as ${localName}`,
          );
        }
        if (bindings.length === NO_TYPE_BINDINGS) return;

        context.report({
          node,
          messageId: "inlineTypeImport",
          data: { bindings: bindings.join(", "), module: node.source.value },
        });
      },
    };
  },
});

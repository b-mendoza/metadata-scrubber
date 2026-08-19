import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { getStaticPropertyName, isServerModule } from "../utils.ts";

const SCHEMA_COMPILER_NAMES = new Set<string>([
  "is",
  "decodeUnknownEffect",
  "decodeEffect",
  "decodeUnknownExit",
  "decodeExit",
  "decodeUnknownOption",
  "decodeOption",
  "decodeUnknownResult",
  "decodeResult",
  "decodeUnknownPromise",
  "decodePromise",
  "decodeUnknownSync",
  "decodeSync",
  "encodeUnknownEffect",
  "encodeEffect",
  "encodeUnknownExit",
  "encodeExit",
  "encodeUnknownOption",
  "encodeOption",
  "encodeUnknownResult",
  "encodeResult",
  "encodeUnknownPromise",
  "encodePromise",
  "encodeUnknownSync",
  "encodeSync",
]);
const FUNCTION_DEPTH_STEP = 1;
const MODULE_SCOPE_FUNCTION_DEPTH = 0;

const getImportedName = (
  specifier: ESTree.ImportSpecifier,
): string | undefined => {
  const { imported } = specifier;
  if (imported.type === "Identifier") return imported.name;
  return typeof imported.value === "string" ? imported.value : undefined;
};

const isEffectSchemaImportDefinition = (definition: Definition): boolean => {
  if (definition.type !== "ImportBinding") return false;
  if (definition.node.type !== "ImportSpecifier") return false;
  if (definition.parent?.type !== "ImportDeclaration") return false;
  return (
    definition.parent.source.value === "effect" &&
    getImportedName(definition.node) === "Schema"
  );
};

const isEffectSchemaImport = (variable: Variable): boolean =>
  variable.defs.some(isEffectSchemaImportDefinition);

const isEffectSchemaReference = (
  node: ESTree.IdentifierReference,
  sourceCode: SourceCode,
): boolean => {
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) return isEffectSchemaImport(variable);
    scope = scope.upper;
  }
  return false;
};

const getSchemaCompiler = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
): ESTree.MemberExpression | undefined => {
  const compilerCallee = node.callee;
  if (compilerCallee.type !== "MemberExpression") return undefined;
  if (compilerCallee.object.type !== "Identifier") return undefined;
  if (!isEffectSchemaReference(compilerCallee.object, sourceCode)) {
    return undefined;
  }
  const propertyName = getStaticPropertyName(compilerCallee);
  return propertyName !== undefined && SCHEMA_COMPILER_NAMES.has(propertyName)
    ? compilerCallee
    : undefined;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require Effect Schema compiler creation at module scope.",
    },
    messages: {
      compilerInsideFunction:
        "`{{ schemaReference }}.{{ compiler }}(...)` creates a reusable Effect Schema compiler. Move this call to module scope, for example `const runSchema = Schema.{{ compiler }}(valueSchema)`. Call `runSchema(input)` inside the function. Creating the compiler inside a function repeats its setup on every call.",
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
        const compiler = getSchemaCompiler(node, context.sourceCode);
        if (compiler === undefined) return;
        const compilerName = getStaticPropertyName(compiler);
        if (
          compilerName === undefined ||
          compiler.object.type !== "Identifier"
        ) {
          return;
        }
        context.report({
          node: compiler,
          messageId: "compilerInsideFunction",
          data: {
            compiler: compilerName,
            schemaReference: compiler.object.name,
          },
        });
      },
    };
  },
});

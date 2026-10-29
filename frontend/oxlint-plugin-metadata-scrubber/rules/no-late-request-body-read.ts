import type { Definition, ESTree, SourceCode, Variable } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  getConstInitializedDeclarator,
  getReferencedVariable,
  getRuntimeImportDeclaration,
  getStaticPropertyName,
  isTestFile,
} from "../utilities.ts";

type RecordKind =
  | "vitest"
  | "vi"
  | "factory"
  | "mock"
  | "record"
  | "calls"
  | "call"
  | "argument"
  | "request";

const BODY_METHODS = new Set([
  "json",
  "text",
  "formData",
  "arrayBuffer",
  "blob",
  "clone",
]);
const INDEX_PATTERN = /^\d+$/v;
const MEMBER_KINDS: Partial<
  Record<RecordKind, Readonly<Record<string, RecordKind>>>
> = {
  vitest: { vi: "vi" },
  vi: { fn: "factory", spyOn: "factory", mocked: "factory" },
  mock: { mock: "record" },
  record: { calls: "calls", lastCall: "call" },
  call: { "0": "argument" },
  argument: { request: "request" },
};

const getMemberKind = (
  kind: RecordKind | null,
  property: string | null,
): RecordKind | null => {
  if (kind == null || property == null) return null;
  if (kind === "calls" && INDEX_PATTERN.test(property)) return "call";
  return MEMBER_KINDS[kind]?.[property] ?? null;
};

const getPropertyKey = (
  key: ESTree.Node,
  isComputed: boolean,
): string | null => {
  if (!isComputed && key.type === "Identifier") return key.name;
  if (
    key.type === "Literal" &&
    (typeof key.value === "string" || typeof key.value === "number")
  ) {
    return String(key.value);
  }
  return null;
};

const getArrayPatternKind = (
  pattern: ESTree.ArrayPattern,
  target: ESTree.Node,
  kind: RecordKind | null,
): RecordKind | null => {
  for (const [index, element] of pattern.elements.entries()) {
    if (element == null || element.type === "RestElement") continue;
    const found = getPatternKind(
      element,
      target,
      getMemberKind(kind, String(index)),
    );
    if (found != null) return found;
  }
  return null;
};

const getObjectPatternKind = (
  pattern: ESTree.ObjectPattern,
  target: ESTree.Node,
  kind: RecordKind | null,
): RecordKind | null => {
  for (const property of pattern.properties) {
    if (property.type !== "Property") continue;
    const key = getPropertyKey(property.key, property.computed);
    const found = getPatternKind(
      property.value,
      target,
      getMemberKind(kind, key),
    );
    if (found != null) return found;
  }
  return null;
};

const getPatternKind = (
  pattern: ESTree.BindingPattern,
  target: ESTree.Node,
  kind: RecordKind | null,
): RecordKind | null => {
  if (pattern === target) return kind;
  if (pattern.type === "AssignmentPattern") {
    return getPatternKind(pattern.left, target, kind);
  }
  if (pattern.type === "ArrayPattern") {
    return getArrayPatternKind(pattern, target, kind);
  }
  if (pattern.type === "ObjectPattern") {
    return getObjectPatternKind(pattern, target, kind);
  }
  return null;
};

const getImportKind = (definition: Definition): RecordKind | null => {
  const declaration = getRuntimeImportDeclaration(definition);
  if (declaration?.source.value !== "vitest") return null;
  if (definition.node.type === "ImportNamespaceSpecifier") return "vitest";
  if (definition.node.type !== "ImportSpecifier") {
    return null;
  }
  const { imported } = definition.node;
  const name = imported.type === "Identifier" ? imported.name : imported.value;
  return name === "vi" ? "vi" : null;
};

const getVariableKind = (
  variable: Variable,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): RecordKind | null => {
  for (const definition of variable.defs) {
    const imported = getImportKind(definition);
    if (imported != null) return imported;
    const declaration = getConstInitializedDeclarator(definition);
    if (declaration == null || definition.type !== "Variable") continue;
    return getPatternKind(
      declaration.node.id,
      definition.name,
      getRecordKind(declaration.initializer, sourceCode, seen),
    );
  }
  return null;
};

const getCallKind = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): RecordKind | null => {
  if (getRecordKind(node.callee, sourceCode, new Set(seen)) === "factory") {
    return "mock";
  }
  if (node.callee.type !== "MemberExpression") return null;
  const kind = getRecordKind(node.callee.object, sourceCode, seen);
  const method = getStaticPropertyName(node.callee);
  if (kind === "calls" && method === "at") return "call";
  return kind === "mock" && method?.startsWith("mock") === true ? "mock" : null;
};

const getRecordMemberKind = (
  node: ESTree.MemberExpression,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): RecordKind | null => {
  const kind = getRecordKind(node.object, sourceCode, seen);
  const property = getPropertyKey(node.property, node.computed);
  if (property == null && kind === "calls" && node.computed) return "call";
  return getMemberKind(kind, property);
};

const getRecordReferenceKind = (
  node: Extract<ESTree.Node, { type: "Identifier" }>,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): RecordKind | null => {
  const variable = getReferencedVariable(node, sourceCode);
  if (variable == null || seen.has(variable)) return null;
  seen.add(variable);
  return getVariableKind(variable, sourceCode, seen);
};

const isRecordWrapper = (
  node: ESTree.Node,
): node is Extract<
  ESTree.Node,
  {
    type:
      | "ChainExpression"
      | "TSAsExpression"
      | "TSNonNullExpression"
      | "TSSatisfiesExpression";
  }
> =>
  node.type === "ChainExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSSatisfiesExpression";

const getRecordKind = (
  node: ESTree.Node,
  sourceCode: SourceCode,
  seen = new Set<Variable>(),
): RecordKind | null => {
  if (isRecordWrapper(node)) {
    return getRecordKind(node.expression, sourceCode, seen);
  }
  if (node.type === "MemberExpression") {
    return getRecordMemberKind(node, sourceCode, seen);
  }
  if (node.type === "CallExpression") {
    return getCallKind(node, sourceCode, seen);
  }
  if (node.type !== "Identifier") return null;
  return getRecordReferenceKind(node, sourceCode, seen);
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Read request bodies inside handlers, not from later Vitest mock records.",
    },
    messages: {
      lateBodyRead:
        "`{{ bodyRead }}` reads a request body from a Vitest mock record. Ky can consume the body first. Read or clone it inside the MSW handler and store the value: `const bodies: unknown[] = []; const handler = vi.fn<HttpResponseResolver>(async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(response); });`. Import `vi` from `vitest` and `HttpResponseResolver` and `HttpResponse` from `msw`.",
    },
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          !BODY_METHODS.has(getStaticPropertyName(node.callee) ?? "")
        ) {
          return;
        }
        const kind = getRecordKind(node.callee.object, context.sourceCode);
        if (kind !== "request" && kind !== "argument") return;
        context.report({
          node,
          messageId: "lateBodyRead",
          data: { bodyRead: context.sourceCode.getText(node) },
        });
      },
    };
  },
});

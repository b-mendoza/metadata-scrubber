import type {
  Definition,
  ESTree,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";

const API_ROUTE_PATH_PATTERN = /(?:^|\/)src\/routes\/api\/.*\.tsx?$/v;
const DOMAIN_SERVER_MODULE_PATH_PATTERN =
  /(?:^|\/)src\/.*\.mod\.server\.tsx?$/v;
const SERVER_FIXTURE_PATH_PATTERN = /(?:^|\/)fixtures\/.*server.*\.tsx?$/v;
const SHARED_DATABASE_SERVER_PATH_PATTERN =
  /(?:^|\/)src\/shared\/database\/.*\.server\.tsx?$/v;
const SHARED_MIDDLEWARE_PATH_PATTERN =
  /(?:^|\/)src\/shared\/middlewares\/.*\.tsx?$/v;
const TEST_FILE_PATH_PATTERN = /\.test\.[cm]?[jt]sx?$/v;

export const getReferencedVariable = (
  node: Extract<ESTree.Node, { type: "Identifier" | "JSXIdentifier" }>,
  sourceCode: SourceCode,
): Variable | null => {
  // A type-only declaration can shadow the name without shadowing its value.
  // Switch discriminants can have their reference in an upper scope.
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope != null) {
    const reference = scope.references.find(
      (candidate) => candidate.identifier === node,
    );
    if (reference != null) return reference.resolved;
    scope = scope.upper;
  }
  return null;
};

export const getConstDeclaratorInitializer = (
  definition: Definition,
): ESTree.Expression | null => {
  return definition.type === "Variable" &&
    definition.node.type === "VariableDeclarator" &&
    definition.node.id.type === "Identifier" &&
    definition.parent?.type === "VariableDeclaration" &&
    definition.parent.kind === "const"
    ? definition.node.init
    : null;
};

export const getStaticPropertyName = (
  node: ESTree.Node | null | undefined,
): string | null => {
  if (node?.type !== "MemberExpression") return null;
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
    ? node.property.value
    : null;
};

export const isFunction = (
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionDeclaration" ||
  node?.type === "FunctionExpression";

export const isTestFile = (filename: string): boolean =>
  TEST_FILE_PATH_PATTERN.test(filename.replaceAll("\\", "/"));

export const isServerModule = (filename: string, cwd: string): boolean => {
  const path = toProjectPath(filename, cwd);
  return (
    DOMAIN_SERVER_MODULE_PATH_PATTERN.test(path) ||
    SHARED_DATABASE_SERVER_PATH_PATTERN.test(path) ||
    API_ROUTE_PATH_PATTERN.test(path) ||
    SHARED_MIDDLEWARE_PATH_PATTERN.test(path) ||
    SERVER_FIXTURE_PATH_PATTERN.test(path)
  );
};

export const toProjectPath = (filename: string, cwd: string): string => {
  const normalizedFilename = filename.replaceAll("\\", "/");
  const normalizedCwd = cwd
    .replaceAll("\\", "/")
    .replaceAll(/(?<!\/)\/+$/gv, "");
  const prefix = `${normalizedCwd}/`;
  return normalizedFilename.startsWith(prefix)
    ? normalizedFilename.slice(prefix.length)
    : normalizedFilename;
};

const APP_BINDINGS_MODULE =
  "#/shared/middlewares/app-bindings/app-bindings.mod";
const EMPTY_ITEM_COUNT = 0;
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head"]);

type HttpBindingKind =
  | "app-bindings-module"
  | "bindings-getter"
  | "bindings"
  | "backend-client"
  | "ky-module"
  | "ky"
  | "factory-module"
  | "factory";

export const unwrapHttpExpression = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSInstantiationExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "ChainExpression"
  ) {
    return unwrapHttpExpression(node.expression);
  }
  return node;
};

const HTTP_MEMBER_KINDS: Partial<
  Record<HttpBindingKind, Readonly<Record<string, HttpBindingKind>>>
> = {
  "app-bindings-module": { getAppBindings: "bindings-getter" },
  "ky-module": { default: "ky" },
  ky: { create: "factory", extend: "factory" },
};

const getHttpMemberKind = (
  objectKind: HttpBindingKind | null,
  property: string | null,
): HttpBindingKind | null => {
  if (objectKind == null || property == null) return null;
  if (objectKind === "bindings") return "backend-client";
  if (objectKind === "factory-module") return "factory";
  return HTTP_MEMBER_KINDS[objectKind]?.[property] ?? null;
};

const getTemplatePrefix = (node: ESTree.TemplateLiteral): string | null => {
  const [first] = node.quasis;
  return first?.value.cooked ?? null;
};

export const getHttpPropertyName = (
  node: Extract<ESTree.Node, { type: "Property" }>,
): string | null => {
  const key = unwrapHttpExpression(node.key);
  if (!node.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  if (
    key.type === "TemplateLiteral" &&
    key.expressions.length === EMPTY_ITEM_COUNT
  ) {
    return getTemplatePrefix(key);
  }
  return null;
};

export const getRuntimeImportDeclaration = (
  definition: Definition,
): ESTree.ImportDeclaration | null => {
  if (definition.type !== "ImportBinding") return null;
  const declaration = definition.parent;
  if (
    declaration?.type !== "ImportDeclaration" ||
    declaration.importKind === "type" ||
    (definition.node.type === "ImportSpecifier" &&
      definition.node.importKind === "type")
  ) {
    return null;
  }
  return declaration;
};

const getHttpImportKind = (definition: Definition): HttpBindingKind | null => {
  const declaration = getRuntimeImportDeclaration(definition);
  if (declaration == null) return null;
  const moduleKind = getHttpImportModuleKind(declaration.source.value);
  const specifier = definition.node;
  if (specifier.type === "ImportNamespaceSpecifier") return moduleKind;
  const member =
    specifier.type === "ImportSpecifier" ? specifier.imported : null;
  const name = member?.type === "Identifier" ? member.name : member?.value;
  return getHttpMemberKind(moduleKind, name ?? "default");
};

const getHttpImportModuleKind = (source: string): HttpBindingKind | null => {
  if (source === "ky") return "ky-module";
  if (source === APP_BINDINGS_MODULE) return "app-bindings-module";
  return source.startsWith("#/shared/libs/ky/") ? "factory-module" : null;
};

export const getConstInitializedDeclarator = (
  definition: Definition,
): {
  node: ESTree.VariableDeclarator;
  initializer: ESTree.Expression;
} | null => {
  const { node, parent } = definition;
  if (
    node.type !== "VariableDeclarator" ||
    parent?.type !== "VariableDeclaration" ||
    parent.kind !== "const" ||
    node.init == null
  ) {
    return null;
  }
  return { node, initializer: node.init };
};

const getDestructuredHttpKind = ({
  definition,
  name,
  sourceCode,
  seen,
}: {
  definition: Definition;
  name: string;
  sourceCode: SourceCode;
  seen: Set<Variable>;
}): HttpBindingKind | null => {
  const declaration = getConstInitializedDeclarator(definition);
  if (
    definition.type !== "Variable" ||
    declaration?.node.id.type !== "ObjectPattern"
  ) {
    return null;
  }
  const property = declaration.node.id.properties.find(
    (candidate) =>
      candidate.type === "Property" &&
      candidate.value.type === "Identifier" &&
      candidate.value.name === name,
  );
  if (property?.type !== "Property") return null;
  return getHttpMemberKind(
    getHttpBindingKind(declaration.initializer, sourceCode, seen),
    getHttpPropertyName(property),
  );
};

const getHttpVariableKind = (
  variable: Variable,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): HttpBindingKind | null => {
  for (const definition of variable.defs) {
    const imported = getHttpImportKind(definition);
    if (imported != null) return imported;
    const initializer = getConstDeclaratorInitializer(definition);
    if (initializer != null) {
      return getHttpBindingKind(initializer, sourceCode, seen);
    }
    const destructured = getDestructuredHttpKind({
      definition,
      name: variable.name,
      sourceCode,
      seen,
    });
    if (destructured != null) return destructured;
  }
  return null;
};

// Follow local const aliases only. Cross-file and mutable data flow need type analysis.
export const getHttpBindingKind = (
  expression: ESTree.Node,
  sourceCode: SourceCode,
  seen = new Set<Variable>(),
): HttpBindingKind | null => {
  const node = unwrapHttpExpression(expression);
  if (node.type === "CallExpression") {
    return getHttpBindingKind(node.callee, sourceCode, seen) ===
      "bindings-getter"
      ? "bindings"
      : null;
  }
  if (node.type === "MemberExpression") {
    return getHttpMemberKind(
      getHttpBindingKind(node.object, sourceCode, seen),
      getStaticPropertyName(node),
    );
  }
  if (node.type !== "Identifier") return null;
  const variable = getReferencedVariable(node, sourceCode);
  if (variable == null || seen.has(variable)) return null;
  seen.add(variable);
  return getHttpVariableKind(variable, sourceCode, seen);
};

export const getHttpRequestKind = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
): "backend-client" | "ky" | null => {
  const callee = unwrapHttpExpression(node.callee);
  if (getHttpBindingKind(callee, sourceCode) === "ky") return "ky";
  if (callee.type !== "MemberExpression") return null;
  const method = getStaticPropertyName(callee);
  if (method == null || !HTTP_METHODS.has(method)) return null;
  const kind = getHttpBindingKind(callee.object, sourceCode);
  return kind === "backend-client" || kind === "ky" ? kind : null;
};

type QueryBindingKind =
  | "router-module"
  | "file-route-factory"
  | "root-route-factory"
  | "context-route-factory"
  | "route-options-factory"
  | "route"
  | "route-context"
  | "query-module"
  | "query-hook"
  | "query-client"
  | "query-provider"
  | "trpc-module"
  | "trpc-context"
  | "trpc-hook"
  | "trpc"
  | "trpc-provider"
  | "provider-module";

const QUERY_IMPORT_KINDS: Readonly<Record<string, QueryBindingKind>> = {
  "@tanstack/react-router": "router-module",
  "@tanstack/react-query": "query-module",
  "#/shared/libs/trpc/client/client-runtime.mod": "trpc-module",
  "#/shared/libs/trpc/client/client.mod": "provider-module",
};

const QUERY_MEMBER_KINDS: Partial<
  Record<QueryBindingKind, Readonly<Record<string, QueryBindingKind>>>
> = {
  "router-module": {
    createFileRoute: "file-route-factory",
    createRootRoute: "root-route-factory",
    createRootRouteWithContext: "context-route-factory",
  },
  route: { useRouteContext: "route-context" },
  "route-context": { queryClient: "query-client", trpc: "trpc" },
  "query-module": {
    useQueryClient: "query-hook",
    QueryClientProvider: "query-provider",
  },
  "trpc-module": { trpcContext: "trpc-context" },
  "trpc-context": { useTRPC: "trpc-hook", TRPCProvider: "trpc-provider" },
  "provider-module": { TRPCProvider: "trpc-provider" },
};

const getQueryMemberKind = (
  kind: QueryBindingKind | null,
  name: string | null,
): QueryBindingKind | null => {
  if (kind == null || name == null) return null;
  return QUERY_MEMBER_KINDS[kind]?.[name] ?? null;
};

const getQueryImportKind = (
  definition: Definition,
): QueryBindingKind | null => {
  const declaration = getRuntimeImportDeclaration(definition);
  if (declaration == null) return null;
  const kind = QUERY_IMPORT_KINDS[declaration.source.value] ?? null;
  const specifier = definition.node;
  if (specifier.type === "ImportNamespaceSpecifier") return kind;
  if (specifier.type !== "ImportSpecifier") return null;
  const { imported } = specifier;
  return getQueryMemberKind(
    kind,
    imported.type === "Identifier" ? imported.name : imported.value,
  );
};

const getPatternPath = (
  identifier: ESTree.Node,
  pattern: ESTree.Node,
): readonly string[] | null => {
  if (identifier === pattern) return [];
  const { parent } = identifier;
  if (parent?.type !== "Property" || parent.value !== identifier) return null;
  const key = getHttpPropertyName(parent);
  if (key == null || parent.parent.type !== "ObjectPattern") return null;
  const path = getPatternPath(parent.parent, pattern);
  return path == null ? null : [...path, key];
};

const getQueryVariableKind = (
  definition: Definition,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): QueryBindingKind | null => {
  const { node, parent } = definition;
  if (
    node.type !== "VariableDeclarator" ||
    parent?.type !== "VariableDeclaration" ||
    parent.kind !== "const" ||
    node.init == null
  ) {
    return null;
  }
  const path = getPatternPath(definition.name, node.id);
  if (path == null) return null;
  let kind = getQueryBindingKind(node.init, sourceCode, seen);
  for (const key of path) {
    kind = getQueryMemberKind(kind, key);
  }
  return kind;
};

const QUERY_CALL_KINDS: Partial<Record<QueryBindingKind, QueryBindingKind>> = {
  "file-route-factory": "route-options-factory",
  "context-route-factory": "route-options-factory",
  "root-route-factory": "route",
  "route-options-factory": "route",
  "query-hook": "query-client",
  "trpc-hook": "trpc",
  "route-context": "route-context",
};

const getQueryReferenceKind = (
  node: Extract<ESTree.Node, { type: "Identifier" | "JSXIdentifier" }>,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): QueryBindingKind | null => {
  const variable = getReferencedVariable(node, sourceCode);
  if (variable == null || seen.has(variable)) return null;
  seen.add(variable);
  for (const definition of variable.defs) {
    const kind =
      getQueryImportKind(definition) ??
      getQueryVariableKind(definition, sourceCode, seen);
    if (kind != null) return kind;
  }
  return null;
};

const getQueryMemberBindingKind = (
  node: ESTree.MemberExpression | ESTree.JSXMemberExpression,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): QueryBindingKind | null => {
  const kind = getQueryBindingKind(node.object, sourceCode, seen);
  const key =
    node.type === "JSXMemberExpression"
      ? node.property.name
      : getStaticPropertyName(node);
  return getQueryMemberKind(kind, key);
};

const getQueryCallBindingKind = (
  node: ESTree.CallExpression,
  sourceCode: SourceCode,
  seen: Set<Variable>,
): QueryBindingKind | null => {
  const kind = getQueryBindingKind(node.callee, sourceCode, seen);
  return kind == null ? null : (QUERY_CALL_KINDS[kind] ?? null);
};

export const getQueryBindingKind = (
  expression: ESTree.Node,
  sourceCode: SourceCode,
  seen = new Set<Variable>(),
): QueryBindingKind | null => {
  const node = unwrapHttpExpression(expression);
  if (node.type === "CallExpression") {
    return getQueryCallBindingKind(node, sourceCode, seen);
  }
  if (node.type === "MemberExpression" || node.type === "JSXMemberExpression") {
    return getQueryMemberBindingKind(node, sourceCode, seen);
  }
  if (node.type !== "Identifier" && node.type !== "JSXIdentifier") return null;
  return getQueryReferenceKind(node, sourceCode, seen);
};

import type { ESTree } from "@oxlint/plugins";

const FUNCTION_TYPES = new Set<ESTree.Node["type"]>([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);
const EMPTY_SPECIFIER_COUNT = 0;
const PATH_START_INDEX = 0;
const REMOVE_LAST_CHARACTER_END = -1;

const stripTrailingSlashes = (path: string): string => {
  let pathWithoutTrailingSlashes = path;
  while (pathWithoutTrailingSlashes.endsWith("/")) {
    pathWithoutTrailingSlashes = pathWithoutTrailingSlashes.slice(
      PATH_START_INDEX,
      REMOVE_LAST_CHARACTER_END,
    );
  }
  return pathWithoutTrailingSlashes;
};

export const getStaticPropertyName = (
  node: ESTree.Node | null | undefined,
): string | undefined => {
  if (node?.type !== "MemberExpression") return undefined;
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return undefined;
};

export const isIdentifier = (
  node: ESTree.Node | null | undefined,
  name: string,
): node is ESTree.IdentifierReference =>
  node?.type === "Identifier" && node.name === name;

export const isFunction = (
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node !== null && node !== undefined && FUNCTION_TYPES.has(node.type);

export const isTestFile = (filename: string): boolean =>
  /\.test\.[cm]?[jt]sx?$/u.test(normalizePath(filename));

export const isServerModule = (filename: string, cwd: string): boolean => {
  const path = toProjectPath(filename, cwd);
  return (
    /(?:^|\/)src\/.*\.mod\.server\.tsx?$/u.test(path) ||
    /(?:^|\/)src\/shared\/db\/.*\.server\.tsx?$/u.test(path) ||
    /(?:^|\/)src\/routes\/api\/.*\.tsx?$/u.test(path) ||
    /(?:^|\/)src\/shared\/middlewares\/.*\.tsx?$/u.test(path) ||
    /(?:^|\/)fixtures\/.*server.*\.tsx?$/u.test(path)
  );
};

export const normalizePath = (path: string): string =>
  path.replaceAll("\\", "/");

export const toProjectPath = (filename: string, cwd: string): string => {
  const normalizedFilename = normalizePath(filename);
  const normalizedCwd = stripTrailingSlashes(normalizePath(cwd));
  const prefix = `${normalizedCwd}/`;
  return normalizedFilename.startsWith(prefix)
    ? normalizedFilename.slice(prefix.length)
    : normalizedFilename;
};

export const isRuntimeImport = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind !== "type" &&
  (node.specifiers.length === EMPTY_SPECIFIER_COUNT ||
    node.specifiers.some(
      (specifier) =>
        specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
    ));

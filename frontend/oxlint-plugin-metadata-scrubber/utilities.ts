import type { ESTree } from "@oxlint/plugins";

const API_ROUTE_PATH_PATTERN = /(?:^|\/)src\/routes\/api\/.*\.tsx?$/u;
const DOMAIN_SERVER_MODULE_PATH_PATTERN =
  /(?:^|\/)src\/.*\.mod\.server\.tsx?$/u;
const EMPTY_SPECIFIER_COUNT = 0;
const PATH_START_INDEX = 0;
const REMOVE_LAST_CHARACTER_END = -1;
const SERVER_FIXTURE_PATH_PATTERN = /(?:^|\/)fixtures\/.*server.*\.tsx?$/u;
const SHARED_DATABASE_SERVER_PATH_PATTERN =
  /(?:^|\/)src\/shared\/database\/.*\.server\.tsx?$/u;
const SHARED_MIDDLEWARE_PATH_PATTERN =
  /(?:^|\/)src\/shared\/middlewares\/.*\.tsx?$/u;
const TEST_FILE_PATH_PATTERN = /\.test\.[cm]?[jt]sx?$/u;

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
): string | null => {
  if (node?.type !== "MemberExpression") return null;
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
  return null;
};

export const isIdentifier = (
  node: ESTree.Node | null | undefined,
  name: string,
): node is ESTree.IdentifierReference =>
  node?.type === "Identifier" && node.name === name;

export const isFunction = (
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionDeclaration" ||
  node?.type === "FunctionExpression";

export const isTestFile = (filename: string): boolean =>
  TEST_FILE_PATH_PATTERN.test(normalizePath(filename));

export const isServerProjectPath = (path: string): boolean =>
  DOMAIN_SERVER_MODULE_PATH_PATTERN.test(path) ||
  SHARED_DATABASE_SERVER_PATH_PATTERN.test(path) ||
  API_ROUTE_PATH_PATTERN.test(path) ||
  SHARED_MIDDLEWARE_PATH_PATTERN.test(path);

export const isServerModule = (filename: string, cwd: string): boolean => {
  const path = toProjectPath(filename, cwd);
  return isServerProjectPath(path) || SERVER_FIXTURE_PATH_PATTERN.test(path);
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

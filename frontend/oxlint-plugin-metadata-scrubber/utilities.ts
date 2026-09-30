import type { ESTree } from "@oxlint/plugins";

const API_ROUTE_PATH_PATTERN = /(?:^|\/)src\/routes\/api\/.*\.tsx?$/v;
const DOMAIN_SERVER_MODULE_PATH_PATTERN =
  /(?:^|\/)src\/.*\.mod\.server\.tsx?$/v;
const PATH_START_INDEX = 0;
const REMOVE_LAST_CHARACTER_END = -1;
const SERVER_FIXTURE_PATH_PATTERN = /(?:^|\/)fixtures\/.*server.*\.tsx?$/v;
const SHARED_DATABASE_SERVER_PATH_PATTERN =
  /(?:^|\/)src\/shared\/database\/.*\.server\.tsx?$/v;
const SHARED_MIDDLEWARE_PATH_PATTERN =
  /(?:^|\/)src\/shared\/middlewares\/.*\.tsx?$/v;
const TEST_FILE_PATH_PATTERN = /\.test\.[cm]?[jt]sx?$/v;

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

export const isFunction = (
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionDeclaration" ||
  node?.type === "FunctionExpression";

export const isTestFile = (filename: string): boolean =>
  TEST_FILE_PATH_PATTERN.test(filename.replaceAll("\\", "/"));

const isServerProjectPath = (path: string): boolean =>
  DOMAIN_SERVER_MODULE_PATH_PATTERN.test(path) ||
  SHARED_DATABASE_SERVER_PATH_PATTERN.test(path) ||
  API_ROUTE_PATH_PATTERN.test(path) ||
  SHARED_MIDDLEWARE_PATH_PATTERN.test(path);

export const isServerModule = (filename: string, cwd: string): boolean => {
  const path = toProjectPath(filename, cwd);
  return isServerProjectPath(path) || SERVER_FIXTURE_PATH_PATTERN.test(path);
};

export const toProjectPath = (filename: string, cwd: string): string => {
  const normalizedFilename = filename.replaceAll("\\", "/");
  const normalizedCwd = stripTrailingSlashes(cwd.replaceAll("\\", "/"));
  const prefix = `${normalizedCwd}/`;
  return normalizedFilename.startsWith(prefix)
    ? normalizedFilename.slice(prefix.length)
    : normalizedFilename;
};

// @ts-check

const EMPTY_FILE_COUNT = 0;

const GOLANGCI_LINT_CONFIG = ".golangci.yml";

const APPLICATION_PACKAGES = [".", "./internal/..."];

/**
 * @param {string[]} files
 */
const quoteFiles = (files) =>
  files.map((file) => JSON.stringify(file)).join(" ");

/**
 * @param {string} file
 */
const isGoFile = (file) => file.endsWith(".go");

/**
 * @param {string[]} files
 * @returns {string[]}
 * lint-staged can call this task once for each file chunk. The lint tasks
 * after it run only when all chunks are formatted.
 */
const formatStagedGoFiles = (files) => {
  const goFiles = files.filter((file) => isGoFile(file));

  if (goFiles.length === EMPTY_FILE_COUNT) {
    return [];
  }

  return [
    `go tool golangci-lint fmt --config ${GOLANGCI_LINT_CONFIG} ${quoteFiles(goFiles)}`,
  ];
};

// A function task keeps lint-staged from appending staged file names.
const lintBackendPackages = () =>
  `go tool golangci-lint run --config ${GOLANGCI_LINT_CONFIG}`;

const checkCustomRules = () =>
  `go run ./lint/cmd/analyzers ${APPLICATION_PACKAGES.join(" ")}`;

export default {
  "*": [formatStagedGoFiles, lintBackendPackages, checkCustomRules],
};

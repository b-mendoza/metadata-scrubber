const EMPTY_FILE_COUNT = 0;

const GOLANGCI_LINT_CONFIG = ".golangci.yml";

const APPLICATION_PACKAGES = [".", "./internal/..."];

const quoteFiles = (files) =>
  files.map((file) => JSON.stringify(file)).join(" ");

const lintBackend = () => [
  `go tool golangci-lint run --config ${GOLANGCI_LINT_CONFIG}`,
  `go run ./lint/cmd/analyzers ${APPLICATION_PACKAGES.join(" ")}`,
];

const formatAndLintStagedGoFiles = (files) => {
  if (files.length === EMPTY_FILE_COUNT) {
    return [];
  }

  return [
    `go tool golangci-lint fmt --config ${GOLANGCI_LINT_CONFIG} ${quoteFiles(files)}`,
    ...lintBackend(),
  ];
};

export default {
  "*.go": formatAndLintStagedGoFiles,
  "{go.mod,go.sum}": lintBackend,
};

const EMPTY_FILE_COUNT = 0;

const GOLANGCI_LINT_CONFIG = ".golangci.yml";

const APPLICATION_PACKAGES = [".", "./internal/..."];

const quoteFiles = (files) =>
  files.map((file) => JSON.stringify(file)).join(" ");

const isGoFile = (file) => file.endsWith(".go");

const lintBackend = () => [
  `go tool golangci-lint run --config ${GOLANGCI_LINT_CONFIG}`,
  `go run ./lint/cmd/analyzers ${APPLICATION_PACKAGES.join(" ")}`,
];

const checkStagedBackendFiles = (files) => {
  const goFiles = files.filter((file) => isGoFile(file));

  if (goFiles.length === EMPTY_FILE_COUNT) {
    return lintBackend();
  }

  return [
    `go tool golangci-lint fmt --config ${GOLANGCI_LINT_CONFIG} ${quoteFiles(goFiles)}`,
    ...lintBackend(),
  ];
};

export default {
  "*": checkStagedBackendFiles,
};

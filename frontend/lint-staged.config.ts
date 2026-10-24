import type { Configuration } from "lint-staged/config";

const EMPTY_FILE_COUNT = 0;

const SKILL_PATH_MARKERS = [".claude/skills/", ".agents/skills/"] as const;

const isIgnoredSkillPath = (file: string): boolean =>
  SKILL_PATH_MARKERS.some((marker) => file.includes(marker));

const formatStagedFiles = (files: readonly string[]): string[] => {
  const filtered = files.filter((file) => !isIgnoredSkillPath(file));

  if (filtered.length === EMPTY_FILE_COUNT) {
    return [];
  }

  return [
    `oxfmt --no-error-on-unmatched-pattern --write ${filtered
      .map((file) => JSON.stringify(file))
      .join(" ")}`,
  ];
};

const checkFrontendTypes = (): string => "pnpm run lint:types";

const lintStagedConfig: Configuration = {
  "*": formatStagedFiles,
  "*.{js,mjs,cjs,ts,tsx,mts,cts}": [
    "oxlint --fix --deny-warnings",
    "eslint --fix --max-warnings 0 --no-warn-ignored",
  ],
  "*.{ts,tsx,mts,cts}": checkFrontendTypes,
};

export default lintStagedConfig;

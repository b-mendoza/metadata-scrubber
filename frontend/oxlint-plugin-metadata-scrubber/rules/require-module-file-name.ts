import { defineRule } from "@oxlint/plugins";

import { toProjectPath } from "../utilities.ts";

const TYPESCRIPT_EXTENSION_PATTERN = /\.(?:[cm]?ts|tsx)$/v;
const MODULE_SUFFIX_PATTERN = /(?:\.(?:mod|server|test|d))+$/v;
const MODULE_FILE_NAME_PATTERN =
  /\.mod(?:\.server(?:\.test)?\.ts|\.test\.tsx?|\.tsx?)$/v;
const FRAMEWORK_FILES = new Set([
  "src/router.tsx",
  "src/start.ts",
  "src/routeTree.gen.ts",
  "src/tests/setup-test-environment.ts",
]);

const getModuleFileName = (filename: string): string => {
  const extension = filename.endsWith(".tsx") ? "tsx" : "ts";
  const stem = filename
    .replace(TYPESCRIPT_EXTENSION_PATTERN, "")
    .replace(MODULE_SUFFIX_PATTERN, "");
  const serverSuffix = filename.includes(".server.") ? ".server" : "";
  const testSuffix = filename.includes(".test.") ? ".test" : "";
  return `${stem}.mod${serverSuffix}${testSuffix}.${serverSuffix === "" ? extension : "ts"}`;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require module file names and reserve TSX modules for JSX.",
    },
    messages: {
      moduleFileName:
        "`{{ filename }}` does not use a module file name. Rename it to `{{ replacement }}` and update its imports.",
      noJsx:
        "`{{ filename }}` contains no JSX. Rename it to `{{ replacement }}` and update its imports.",
    },
  },
  create(context) {
    const filename = toProjectPath(context.filename, context.cwd);
    if (
      !filename.startsWith("src/") ||
      !TYPESCRIPT_EXTENSION_PATTERN.test(filename) ||
      filename.startsWith("src/routes/") ||
      FRAMEWORK_FILES.has(filename)
    ) {
      return {};
    }
    let hasJsx = false;
    return {
      JSXElement() {
        hasJsx = true;
      },
      JSXFragment() {
        hasJsx = true;
      },
      "Program:exit"(node) {
        if (!MODULE_FILE_NAME_PATTERN.test(filename)) {
          context.report({
            node,
            messageId: "moduleFileName",
            data: { filename, replacement: getModuleFileName(filename) },
          });
        } else if (!hasJsx && filename.endsWith(".mod.tsx")) {
          context.report({
            node,
            messageId: "noJsx",
            data: {
              filename,
              replacement: filename.replace(
                TYPESCRIPT_EXTENSION_PATTERN,
                ".ts",
              ),
            },
          });
        }
      },
    };
  },
});

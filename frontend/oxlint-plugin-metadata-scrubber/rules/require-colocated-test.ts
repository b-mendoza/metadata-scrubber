import { readdirSync } from "node:fs";
import path from "node:path";

import { defineRule } from "@oxlint/plugins";

import { isTestFile, toProjectPath } from "../utilities.ts";

const EQUAL_ORDER = 0;
const FILE_ORDER = new Intl.Collator("en");
const TYPESCRIPT_EXTENSION_PATTERN = /\.tsx?$/v;
const MODULE_SUFFIX_PATTERN = /(?:\.mod)?(?:\.server)?\.tsx?$/v;
const TEST_SUFFIX_PATTERN = /(?:\.mod)?(?:\.server)?\.test\.tsx?$/v;
const ROOT_ROUTE_PREFIX_PATTERN = /^__/v;
const IGNORED_ROUTE_PREFIX_PATTERN = /^-/v;
const SERVER_MODULE_PATTERN = /\.server\.tsx?$/v;

const getModuleStem = (filename: string): string => {
  const stem = path.basename(filename).replace(MODULE_SUFFIX_PATTERN, "");
  return filename.includes("/routes/")
    ? stem.replace(ROOT_ROUTE_PREFIX_PATTERN, "")
    : stem;
};

const findModule = (
  testStem: string,
  filenames: readonly string[],
  isServerTest: boolean,
): string | undefined => {
  const [module] = filenames
    .filter(
      (filename) =>
        TYPESCRIPT_EXTENSION_PATTERN.test(filename) &&
        !isTestFile(filename) &&
        testStem.startsWith(getModuleStem(filename)),
    )
    .toSorted((left, right) => {
      const stemOrder =
        getModuleStem(right).length - getModuleStem(left).length;
      if (stemOrder !== EQUAL_ORDER) return stemOrder;
      const serverOrder =
        Number(SERVER_MODULE_PATTERN.test(left) !== isServerTest) -
        Number(SERVER_MODULE_PATTERN.test(right) !== isServerTest);
      return serverOrder === EQUAL_ORDER
        ? FILE_ORDER.compare(left, right)
        : serverOrder;
    });
  return module;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require tests beside their source modules and run server tests in Node.",
    },
    messages: {
      missingModule:
        "`{{ filename }}` has no matching source module. Move it beside the module it tests and rename it to start with that module's stem, such as `{{ example }}`.",
      moveTest:
        "`{{ filename }}` is not beside `{{ module }}`. Move it to `{{ replacement }}` and update its imports.",
      serverTest:
        "`{{ filename }}` tests server module `{{ module }}`. Rename it to `{{ replacement }}` so Vitest uses the node environment.",
      unreadableDirectory:
        "Cannot check `{{ filename }}` because its source directory cannot be read. Restore the directory and its read permission, then run lint again.",
    },
  },
  create(context) {
    const filename = toProjectPath(context.filename, context.cwd);
    if (
      !filename.startsWith("src/") ||
      !TYPESCRIPT_EXTENSION_PATTERN.test(filename) ||
      filename.startsWith("src/tests/") ||
      !isTestFile(filename)
    ) {
      return {};
    }
    const absoluteFilename = path.resolve(context.cwd, context.filename);
    const directory = path.dirname(absoluteFilename);
    const sourceDirectory = path.join(context.cwd, "src");
    const testStem = path.basename(filename).replace(TEST_SUFFIX_PATTERN, "");
    const isServerTest = filename.endsWith(".server.test.ts");
    const matchingStem = filename.startsWith("src/routes/")
      ? testStem.replace(IGNORED_ROUTE_PREFIX_PATTERN, "")
      : testStem;
    const example = filename.startsWith("src/routes/")
      ? "src/routes/-<route>.test.tsx"
      : "src/<module>/<module>.mod.test.ts";
    return {
      Program(node) {
        const findReadableModule = () => {
          try {
            const nearbyModule = findModule(
              matchingStem,
              readdirSync(directory, { withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => path.join(directory, entry.name)),
              isServerTest,
            );
            const module =
              nearbyModule ??
              findModule(
                matchingStem,
                readdirSync(sourceDirectory, {
                  recursive: true,
                  withFileTypes: true,
                })
                  .filter((entry) => entry.isFile())
                  .map((entry) => path.join(entry.parentPath, entry.name)),
                isServerTest,
              );
            return { module };
          } catch (error) {
            // The rule reports the directory failure with stable text instead of OS-specific details.
            context.report({
              node,
              messageId: "unreadableDirectory",
              data: { filename, error: String(error) },
            });
            return null;
          }
        };
        const search = findReadableModule();
        if (search == null) return;
        const { module } = search;
        if (module == null) {
          context.report({
            node,
            messageId: "missingModule",
            data: {
              filename,
              example,
            },
          });
          return;
        }
        const modulePath = toProjectPath(module, context.cwd);
        const isServer = SERVER_MODULE_PATTERN.test(module);
        const replacementName = isServer
          ? `${testStem}.mod.server.test.ts`
          : path.basename(filename);
        const replacement = path.join(
          path.dirname(modulePath),
          replacementName,
        );
        if (path.dirname(module) !== directory) {
          context.report({
            node,
            messageId: "moveTest",
            data: { filename, module: modulePath, replacement },
          });
        } else if (isServer && !isServerTest) {
          context.report({
            node,
            messageId: "serverTest",
            data: { filename, module: modulePath, replacement },
          });
        }
      },
    };
  },
});

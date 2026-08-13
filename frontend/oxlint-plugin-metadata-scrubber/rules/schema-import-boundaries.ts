import { defineRule } from "@oxlint/plugins";

import { isRuntimeImport, toProjectPath } from "../utils.ts";

const isServerPath = (path: string): boolean =>
  /(?:^|\/)src\/.*\.mod\.server\.tsx?$/u.test(path) ||
  /(?:^|\/)src\/shared\/db\/.*\.server\.tsx?$/u.test(path) ||
  /(?:^|\/)src\/routes\/api\/.*\.tsx?$/u.test(path) ||
  /(?:^|\/)src\/shared\/middlewares\/.*\.tsx?$/u.test(path) ||
  /(?:^|\/)fixtures\/.*server.*\.tsx?$/u.test(path);

const isBrowserPath = (path: string): boolean =>
  /(?:^|\/)src\/domains\/[^/]+\/components\/.*\.tsx?$/u.test(path) ||
  /(?:^|\/)src\/router\.tsx$/u.test(path) ||
  /(?:^|\/)src\/routes\/(?:__root|index)\.tsx$/u.test(path) ||
  /(?:^|\/)src\/shared\/libs\/trpc\/client\/.*\.tsx?$/u.test(path) ||
  /(?:^|\/)fixtures\/.*browser.*\.tsx?$/u.test(path);

const isSharedPath = (path: string): boolean =>
  /(?:^|\/)src\/domains\/[^/]+\/constants\/.*\.ts$/u.test(path) ||
  /(?:^|\/)src\/shared\/constants\/.*\.ts$/u.test(path) ||
  /(?:^|\/)src\/shared\/utils\/.*\.ts$/u.test(path) ||
  /(?:^|\/)fixtures\/.*shared.*\.tsx?$/u.test(path);

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce the Effect Schema, Zod, and shared runtime import boundaries.",
    },
  },
  create(context) {
    const path = toProjectPath(context.filename, context.cwd);
    const boundary = isServerPath(path)
      ? "server"
      : isBrowserPath(path)
        ? "browser"
        : isSharedPath(path) && !/\.server\.ts$/u.test(path)
          ? "shared"
          : undefined;
    if (boundary === undefined) return {};

    return {
      ImportDeclaration(node) {
        if (!isRuntimeImport(node)) return;
        const source = node.source.value;
        if (boundary === "server" && source === "zod") {
          context.report({
            node,
            message: "Use Effect Schema in server modules.",
          });
          return;
        }
        if (boundary === "browser" && source === "effect") {
          context.report({ node, message: "Use Zod in browser modules." });
          return;
        }
        if (
          boundary === "shared" &&
          (source === "effect" || source === "zod")
        ) {
          context.report({
            node,
            message:
              "Keep shared modules free of runtime imports from Effect Schema and Zod.",
          });
        }
      },
    };
  },
});

import type { ESTree } from "@oxlint/plugins";
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

type ImportBoundary = "browser" | "server" | "shared";

const SHARED_BOUNDARY_MESSAGE =
  "Keep shared modules free of runtime imports from Effect Schema and Zod.";

const IMPORT_BOUNDARY_MESSAGES = {
  browser: {
    effect: "Use Zod in browser modules.",
  },
  server: {
    zod: "Use Effect Schema in server modules.",
  },
  shared: {
    effect: SHARED_BOUNDARY_MESSAGE,
    zod: SHARED_BOUNDARY_MESSAGE,
  },
} as const satisfies Record<ImportBoundary, Readonly<Record<string, string>>>;

const getImportBoundary = (path: string): ImportBoundary | undefined => {
  if (isServerPath(path)) return "server";
  if (isBrowserPath(path)) return "browser";
  if (isSharedPath(path) && !path.endsWith(".server.ts")) return "shared";
  return undefined;
};

const getImportBoundaryMessage = (
  boundary: ImportBoundary,
  node: ESTree.ImportDeclaration,
): string | undefined => {
  const messages: Readonly<Record<string, string>> =
    IMPORT_BOUNDARY_MESSAGES[boundary];
  return messages[node.source.value];
};

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
    const boundary = getImportBoundary(path);
    if (boundary === undefined) return {};

    return {
      ImportDeclaration(node) {
        if (!isRuntimeImport(node)) return;
        const message = getImportBoundaryMessage(boundary, node);
        if (message === undefined) return;
        context.report({ node, message });
      },
    };
  },
});

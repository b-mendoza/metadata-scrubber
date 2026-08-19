import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import {
  isRuntimeImport,
  isServerProjectPath,
  toProjectPath,
} from "../utils.ts";

const isSchemaBoundaryServerFixturePath = (path: string): boolean =>
  /(?:^|\/)fixtures\/(?:positive|negative)\/schema-boundary\.server\.tsx?$/u.test(
    path,
  );

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
type SchemaPackage = "effect" | "zod";

const isSchemaPackage = (source: string): source is SchemaPackage =>
  source === "effect" || source === "zod";

const messages = {
  browserEffectRuntimeImport:
    'This browser module imports the `{{ source }}` package at runtime. Remove this runtime import because it increases the client bundle. Rewrite schema validation with `import * as z from "zod"` and the Zod API. Rewrite other Effect code with browser-native functions. Keep only a type-only import from `effect` when required.',
  serverZodRuntimeImport:
    'This server module imports the `{{ source }}` package at runtime. Replace this runtime import with `import { Schema } from "effect"`. Rewrite each runtime schema with the Effect Schema API and create its compiler at module scope. Effect Schema decoders compose with server Effect pipelines. Keep only a type-only import from `zod` here.',
  sharedRuntimeImport:
    "This shared module imports the `{{ source }}` package at runtime. Shared modules cross browser and server boundaries, so they must not load the `effect` package or the `zod` package at runtime. Export plain data and types here. Move runtime code to the browser module or server module that owns it. Use the Zod API for browser schemas and the Effect Schema API for server schemas. Use a type-only import when a shared declaration needs a library type.",
} as const;

type MessageId = keyof typeof messages;

const IMPORT_BOUNDARY_MESSAGE_IDS = {
  browser: {
    effect: "browserEffectRuntimeImport",
  },
  server: {
    zod: "serverZodRuntimeImport",
  },
  shared: {
    effect: "sharedRuntimeImport",
    zod: "sharedRuntimeImport",
  },
} as const satisfies Record<
  ImportBoundary,
  Readonly<Partial<Record<SchemaPackage, MessageId>>>
>;

const getImportBoundary = (path: string): ImportBoundary | undefined => {
  if (
    path.endsWith(".server.ts") ||
    path.endsWith(".server.tsx") ||
    isServerProjectPath(path) ||
    isSchemaBoundaryServerFixturePath(path)
  ) {
    return "server";
  }
  if (isBrowserPath(path)) return "browser";
  if (isSharedPath(path)) return "shared";
  return undefined;
};

const getImportBoundaryMessageId = (
  boundary: ImportBoundary,
  node: ESTree.ImportDeclaration,
): MessageId | undefined => {
  const source = node.source.value;
  if (!isSchemaPackage(source)) return undefined;
  const messageIds: Readonly<Partial<Record<SchemaPackage, MessageId>>> =
    IMPORT_BOUNDARY_MESSAGE_IDS[boundary];
  return messageIds[source];
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce the Effect Schema, Zod, and shared runtime import boundaries.",
    },
    messages,
  },
  create(context) {
    const path = toProjectPath(context.filename, context.cwd);
    const boundary = getImportBoundary(path);
    if (boundary === undefined) return {};

    return {
      ImportDeclaration(node) {
        if (!isRuntimeImport(node)) return;
        const messageId = getImportBoundaryMessageId(boundary, node);
        if (messageId === undefined) return;
        context.report({
          node,
          messageId,
          data: { source: node.source.value },
        });
      },
    };
  },
});

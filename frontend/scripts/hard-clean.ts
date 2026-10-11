import { rm } from "node:fs/promises";

const PATHS = [
  "dist/",
  ".wrangler/",
  "coverage/",
  "node_modules/",
  "pnpm-lock.yaml",
];

await Promise.all(
  PATHS.map(async (path) =>
    rm(path, {
      force: true,
      recursive: true,
    }),
  ),
);

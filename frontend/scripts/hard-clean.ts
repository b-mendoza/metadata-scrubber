import { rm } from "node:fs/promises";

const PATHS = ["coverage/", "dist/", "node_modules/", "pnpm-lock.yaml"];

await Promise.all(
  PATHS.map(async (path) =>
    rm(path, {
      force: true,
      recursive: true,
    }),
  ),
);

import { rm } from "node:fs/promises";

const PATHS = [".wrangler/", "coverage/", "dist/", "node_modules/.cache/"];

await Promise.all(
  PATHS.map(async (path) =>
    rm(path, {
      force: true,
      recursive: true,
    }),
  ),
);

import { rm } from "node:fs/promises";
import { inspect } from "node:util";

import { ResultAsync } from "neverthrow";

const PATHS = [".output/", "coverage/", "node_modules/.cache/"];
const FAILURE_EXIT_CODE = 1;

function mapRemovalError(cause: unknown) {
  return new Error("Could not remove the soft-clean paths.", { cause });
}

const result = await ResultAsync.fromPromise(
  Promise.all(
    PATHS.map(async (path) =>
      rm(path, {
        force: true,
        recursive: true,
      }),
    ),
  ),
  mapRemovalError,
);
if (result.isErr()) {
  process.stderr.write(`${inspect(result.error)}\n`);
  process.exitCode = FAILURE_EXIT_CODE;
}

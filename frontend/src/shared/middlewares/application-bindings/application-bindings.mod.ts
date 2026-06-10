import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import * as z from "zod";

import type { Env } from "#/shared/config/env/env.mod.server";
import { envSchema } from "#/shared/config/env/env.mod.server";
import type { DrizzleDatabaseClient } from "#/shared/db/db.mod.server";
import { createDrizzleDatabaseClient } from "#/shared/db/db.mod.server";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface ApplicationBindingsValue {
  db: DrizzleDatabaseClient;
  env: Env;
}

const ApplicationBindingsStorage =
  new AsyncLocalStorage<ApplicationBindingsValue>();

export const applicationBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (opts) => {
  const safeEnvironmentVariables = z.parse(envSchema, process.env);

  const databaseClient = createDrizzleDatabaseClient(
    safeEnvironmentVariables.DATABASE_URL,
  );

  return ApplicationBindingsStorage.run(
    {
      db: databaseClient,
      env: safeEnvironmentVariables,
    },
    opts.next,
  );
});

export const getApplicationBindings = createServerOnlyFn(() => {
  const store = ApplicationBindingsStorage.getStore();

  invariant(
    store != null,
    "Failed to retrieve application bindings storage store",
  );

  return store;
});

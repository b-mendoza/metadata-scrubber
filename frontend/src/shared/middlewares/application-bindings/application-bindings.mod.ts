import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";

import type { Environment } from "#/shared/config/env/environment.mod.server";
import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface ApplicationBindingsValue {
  // db: DrizzleDatabaseClient;
  env: Environment;
}

const ApplicationBindingsStorage =
  new AsyncLocalStorage<ApplicationBindingsValue>();

export const applicationBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (options) => {
  const safeEnvironmentVariables = environmentSchema.parse(process.env);

  // const databaseClient = createDrizzleDatabaseClient(
  //   safeEnvironmentVariables.DATABASE_URL,
  // );

  return ApplicationBindingsStorage.run(
    {
      env: safeEnvironmentVariables,
    },
    options.next,
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

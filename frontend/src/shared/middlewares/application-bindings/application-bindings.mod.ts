import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";

import type { Environment } from "#/shared/config/env/environment.mod.server";
import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface ApplicationBindingsValue {
  // db: DrizzleDatabaseClient;
  env: Environment;
}

const ApplicationBindingsStorage =
  new AsyncLocalStorage<ApplicationBindingsValue>();
const decodeEnvironmentVariables =
  Schema.decodeUnknownEffect(environmentSchema);

export const applicationBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (options) => {
  const parseEnvironmentVariables = decodeEnvironmentVariables(process.env);
  // TanStack middleware is Promise-based, so execute the Effect at this boundary.
  const safeEnvironmentVariables = await Effect.runPromise(
    parseEnvironmentVariables,
  );

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

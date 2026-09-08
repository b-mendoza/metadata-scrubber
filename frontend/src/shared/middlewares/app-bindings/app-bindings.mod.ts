import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";

import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import type { HTTPClient } from "#/shared/libs/ky/http-client.mod.server";
import { createHttpClient } from "#/shared/libs/ky/http-client.mod.server";
import type { WorkflowHTTPClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface AppBindingsValue {
  // db: DrizzleDatabaseClient;
  httpClient: HTTPClient;
  workflowHttpClient: WorkflowHTTPClient;
}

const AppBindingsStore = new AsyncLocalStorage<AppBindingsValue>();

export const appBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (options) => {
  const safeEnvironmentVariables = environmentSchema.parse(process.env);

  // const databaseClient = createDrizzleDatabaseClient(
  //   safeEnvironmentVariables.DATABASE_URL,
  // );

  const httpClient = createHttpClient(safeEnvironmentVariables.BACKEND_URL);
  const workflowHttpClient = createWorkflowHttpClient(
    safeEnvironmentVariables.BACKEND_URL,
  );

  return AppBindingsStore.run(
    {
      httpClient,
      workflowHttpClient,
    },
    options.next,
  );
});

export const getAppBindings = createServerOnlyFn(() => {
  const store = AppBindingsStore.getStore();

  invariant(store != null, "Failed to retrieve app bindings store");

  return store;
});

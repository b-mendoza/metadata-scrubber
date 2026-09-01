import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";

import type { Environment } from "#/shared/config/env/environment.mod.server";
import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import type { HTTPClient } from "#/shared/libs/ky/http-client.mod.server";
import { createHttpClient } from "#/shared/libs/ky/http-client.mod.server";
import type { WorkflowHTTPClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface ApplicationBindingsValue {
  // db: DrizzleDatabaseClient;
  env: Environment;
  httpClient: HTTPClient;
  workflowHttpClient: WorkflowHTTPClient;
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

  const httpClient = createHttpClient(safeEnvironmentVariables.BACKEND_URL);
  const workflowHttpClient = createWorkflowHttpClient(
    safeEnvironmentVariables.BACKEND_URL,
  );

  return ApplicationBindingsStorage.run(
    {
      env: safeEnvironmentVariables,
      httpClient,
      workflowHttpClient,
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

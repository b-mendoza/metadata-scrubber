import { AsyncLocalStorage } from "node:async_hooks";

import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { env as unsafeEnvironmentVariables } from "cloudflare:workers";
import * as z from "zod";

import type { Env } from "#/shared/config/env/env.mod.server";
import { envSchema } from "#/shared/config/env/env.mod.server";
import type { DrizzleDatabaseClient } from "#/shared/db/db.mod.server";
import { createDrizzleDatabaseClient } from "#/shared/db/db.mod.server";
import { createR2StorageProvider } from "#/shared/storage/r2-storage.mod.server";
import type { StorageProvider } from "#/shared/storage/storage.types";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

interface ApplicationBindingsValue {
  db: DrizzleDatabaseClient;
  env: Env;
  storage: StorageProvider;
}

const ApplicationBindingsStorage =
  new AsyncLocalStorage<ApplicationBindingsValue>();

export const applicationBindingsMiddleware = createMiddleware({
  type: "request",
}).server(async (opts) => {
  const { HYPERDRIVE, UPLOADS_BUCKET, ...restOfUnsafeEnvironmentVariables } =
    unsafeEnvironmentVariables;

  const safeEnvironmentVariables = z.parse(envSchema, {
    ...restOfUnsafeEnvironmentVariables,
    DATABASE_URL: HYPERDRIVE.connectionString,
  });

  const databaseClient = createDrizzleDatabaseClient(
    safeEnvironmentVariables.DATABASE_URL,
  );

  const storageProvider = createR2StorageProvider({
    presigner: {
      bucketName: safeEnvironmentVariables.STORAGE_BUCKET,
      credentials: {
        accessKeyId: safeEnvironmentVariables.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: safeEnvironmentVariables.STORAGE_SECRET_ACCESS_KEY,
      },
      endpoint: safeEnvironmentVariables.STORAGE_ENDPOINT,
      region: safeEnvironmentVariables.STORAGE_REGION,
    },
    r2Bucket: UPLOADS_BUCKET,
  });

  return ApplicationBindingsStorage.run(
    {
      db: databaseClient,
      env: safeEnvironmentVariables,
      storage: storageProvider,
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

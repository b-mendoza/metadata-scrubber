import { TRPCError } from "@trpc/server";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export const BACKEND_HEALTH_CHECK_FAILURE_MESSAGE =
  "The backend health check failed. Try again later.";

const messageResponseSchema = z.object({
  status: z.literal("reachable", {
    error:
      'The backend health response status value must be "reachable". Return a JSON object whose status field is exactly "reachable".',
  }),
});

const BACKEND_HEALTH_STATUS_ENDPOINT = "/api/health";

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async ({ signal }) => {
    const { httpClient } = getAppBindings();

    const backendHealthStatusResult = await ResultAsync.fromPromise(
      httpClient
        .get(BACKEND_HEALTH_STATUS_ENDPOINT, {
          signal: signal ?? null,
        })
        .json(messageResponseSchema),
      (cause: unknown) =>
        new TRPCError({
          cause,
          code: "BAD_GATEWAY",
          message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
        }),
    );

    if (backendHealthStatusResult.isErr()) {
      throw backendHealthStatusResult.error;
    }

    return backendHealthStatusResult.value;
  }),
});

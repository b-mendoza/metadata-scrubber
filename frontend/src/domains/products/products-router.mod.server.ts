import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { TRPCError } from "@trpc/server";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

export const PRODUCTS_RESPONSE_DELAY_MS = 5000;
const SEED_PRODUCT_NAMES = ["Metadata Scrubber", "Privacy Audit Tool"];

export const BACKEND_HEALTH_CHECK_FAILURE_MESSAGE =
  "The backend health check failed. Try again later.";

const PRODUCTS = SEED_PRODUCT_NAMES.map((name) => ({
  id: randomUUID(),
  name,
}));

const getMessageResponseSchema = z.object({
  status: z.literal("reachable", {
    error:
      'The backend health response status value must be "reachable". Return a JSON object whose status field is exactly "reachable".',
  }),
});

const BACKEND_HEALTH_STATUS_ENDPOINT = "/api/health";

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async ({ signal }) => {
    const { httpClient } = getApplicationBindings();

    const backendHealthStatusResult = await ResultAsync.fromPromise(
      httpClient
        .get(BACKEND_HEALTH_STATUS_ENDPOINT, {
          signal: signal ?? null,
        })
        .json(getMessageResponseSchema),
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
  getProducts: publicProcedure.query(async () =>
    setTimeout(PRODUCTS_RESPONSE_DELAY_MS, PRODUCTS),
  ),
});

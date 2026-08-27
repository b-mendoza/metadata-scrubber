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

const productSchema = z.object({
  id: z.uuid({
    error:
      "The product id value must be a UUID string in 8-4-4-4-12 hexadecimal form. Provide a valid UUID string for the product id.",
  }),
  name: z
    .string({
      error:
        "The product name value must be a string. Provide the product name as a string; surrounding whitespace is removed.",
    })
    .trim(),
});

const PRODUCTS = SEED_PRODUCT_NAMES.map((name) => {
  return productSchema.parse({
    id: randomUUID(),
    name,
  });
});

const getMessageResponseSchema = z.object({
  status: z.literal("reachable", {
    error:
      'The backend health response status value must be "reachable". Return a JSON object whose status field is exactly "reachable".',
  }),
});

const API_STATUS_ENDPOINT = "/api/health";

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async ({ signal }) => {
    const { httpClient } = getApplicationBindings();

    const backendHealthResult = await getBackendHealthResult(async () =>
      httpClient
        .get(API_STATUS_ENDPOINT, {
          signal: signal ?? null,
        })
        .json(getMessageResponseSchema),
    );

    if (backendHealthResult.isErr()) {
      throw backendHealthResult.error;
    }

    return backendHealthResult.value;
  }),
  getProducts: publicProcedure.query(async () =>
    setTimeout(PRODUCTS_RESPONSE_DELAY_MS, PRODUCTS),
  ),
});

const getBackendHealthResult = ResultAsync.fromThrowable(
  async <TReturn>(fetcher: () => Promise<TReturn>) => fetcher(),
  (cause: unknown) =>
    new TRPCError({
      cause,
      code: "BAD_GATEWAY",
      message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
    }),
);

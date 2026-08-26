import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

export const BACKEND_HEALTH_ATTEMPT_TIMEOUT_MS = 3000;
export const BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS = 250;
export const BACKEND_HEALTH_RETRY_LIMIT = 1;
export const BACKEND_HEALTH_TOTAL_TIMEOUT_MS = 5000;
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

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async ({ signal }) => {
    const { env } = getApplicationBindings();

    // Resolve against the base URL so a trailing slash on BACKEND_URL (e.g. a
    // Vercel binding URL) can't produce a double-slashed path.
    const backendHealthUrl = new URL("/api/health", env.BACKEND_URL);
    const backendHealthSignals = [
      AbortSignal.timeout(BACKEND_HEALTH_TOTAL_TIMEOUT_MS),
    ];

    if (signal != null) {
      backendHealthSignals.push(signal);
    }

    const backendHealthSignal = AbortSignal.any(backendHealthSignals);

    try {
      return await ky
        .get(backendHealthUrl, {
          retry: {
            backoffLimit: BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS,
            jitter: true,
            limit: BACKEND_HEALTH_RETRY_LIMIT,
            maxRetryAfter: BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS,
            retryOnTimeout: false,
          },
          signal: backendHealthSignal,
          throwHttpErrors: true,
          timeout: BACKEND_HEALTH_ATTEMPT_TIMEOUT_MS,
          totalTimeout: BACKEND_HEALTH_TOTAL_TIMEOUT_MS,
        })
        .json(getMessageResponseSchema);
    } catch (error: unknown) {
      throw new TRPCError({
        cause: error,
        code: "BAD_GATEWAY",
        message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
      });
    }
  }),
  getProducts: publicProcedure.query(async () => {
    await setTimeout(PRODUCTS_RESPONSE_DELAY_MS);
    return PRODUCTS;
  }),
});

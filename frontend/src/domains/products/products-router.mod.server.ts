import { randomUUID } from "node:crypto";

import { Data, Effect } from "effect";
import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const SEED_PRODUCT_NAMES = ["Metadata Scrubber", "Privacy Audit Tool"];
const SLEEP_TIME_MS = 5000;

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

class BackendHealthCheckError extends Data.TaggedError(
  "BackendHealthCheckError",
)<{
  readonly cause: unknown;
}> {}

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async () => {
    const { env } = getApplicationBindings();

    // Resolve against the base URL so a trailing slash on BACKEND_URL (e.g. a
    // Vercel binding URL) can't produce a double-slashed path.
    const backendHealthUrl = new URL("/api/health", env.BACKEND_URL);

    const backendHealthCheck = Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: async () => fetch(backendHealthUrl),
        catch: (cause) => new BackendHealthCheckError({ cause }),
      });
      const responseBody = yield* Effect.tryPromise<
        unknown,
        BackendHealthCheckError
      >({
        try: async () => response.json(),
        catch: (cause) => new BackendHealthCheckError({ cause }),
      });

      return getMessageResponseSchema.parse(responseBody);
    });

    return Effect.runPromise(backendHealthCheck);
  }),
  getProducts: publicProcedure.query(async () => {
    const productsAfterDelay = Effect.gen(function* () {
      yield* Effect.sleep(SLEEP_TIME_MS);
      return PRODUCTS;
    });

    return Effect.runPromise(productsAfterDelay);
  }),
});

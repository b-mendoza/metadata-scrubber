import { randomUUID } from "node:crypto";

import { Data, Effect, Schema } from "effect";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const SEED_PRODUCT_NAMES = ["Metadata Scrubber", "Privacy Audit Tool"];
const SLEEP_TIME_MS = 5_000;

const productSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  name: Schema.Trim,
});
const decodeProduct = Schema.decodeUnknownSync(productSchema);

const PRODUCTS = SEED_PRODUCT_NAMES.map((name) => {
  return decodeProduct({
    id: randomUUID(),
    name,
  });
});

const getMessageResponseSchema = Schema.Struct({
  status: Schema.Literal("reachable"),
});
const decodeGetMessageResponse = Schema.decodeUnknownEffect(
  getMessageResponseSchema,
);

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

      return yield* decodeGetMessageResponse(responseBody);
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

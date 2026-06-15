import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const SEED_PRODUCT_NAMES = ["Metadata Scrubber", "Privacy Audit Tool"];
const SLEEP_TIME_MS = 5_000;

const productSchema = z.object({
  id: z.uuid(),
  name: z.string().trim(),
});

const PRODUCTS = SEED_PRODUCT_NAMES.map((name) => {
  return productSchema.parse({
    id: randomUUID(),
    name,
  });
});

const getMessageResponseSchema = z.object({
  status: z.literal("reachable"),
});

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(async () => {
    const { env } = getApplicationBindings();

    const response = await fetch(`${env.BACKEND_URL}/api/health`);

    return getMessageResponseSchema.parse(await response.json());
  }),
  getProducts: publicProcedure.query(async () =>
    setTimeout(SLEEP_TIME_MS, PRODUCTS),
  ),
});

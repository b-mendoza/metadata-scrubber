import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

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

export const productsRouter = createTRPCRouter({
  getProducts: publicProcedure.query(async () =>
    setTimeout(SLEEP_TIME_MS, PRODUCTS),
  ),
});

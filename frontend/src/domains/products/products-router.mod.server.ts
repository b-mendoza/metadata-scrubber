import { randomUUID } from "node:crypto";

import * as z from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

const productSchema = z.object({
  id: z.uuid(),
  name: z.string().trim(),
});

const SEED_PRODUCT_NAMES = ["Metadata Scrubber", "Privacy Audit Tool"];

const PRODUCTS = SEED_PRODUCT_NAMES.map((name) => {
  return productSchema.parse({
    id: randomUUID(),
    name,
  });
});

export const productsRouter = createTRPCRouter({
  getProducts: publicProcedure.query(() => PRODUCTS),
});

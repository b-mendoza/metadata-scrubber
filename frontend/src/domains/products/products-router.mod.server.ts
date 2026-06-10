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

const PRODUCTS = Array.from({
  length: 2,
}).map((_, idx) => {
  return productSchema.parse({
    id: randomUUID(),
    name: `Product ${idx + 1}`,
  });
});

export const productsRouter = createTRPCRouter({
  getProducts: publicProcedure.query(() => PRODUCTS),
});

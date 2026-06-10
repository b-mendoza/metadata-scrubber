import { productsRouter } from "#/domains/products/products-router.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
  createTRPCRouter,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

export const appRouter = createTRPCRouter({
  products: productsRouter,
});

export type AppRouter = typeof appRouter;

const createCaller = createCallerFactory(appRouter);

export const caller = (request: Request) => {
  return createCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

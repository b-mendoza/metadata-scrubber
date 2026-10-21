import { wizardRouter } from "#/domains/wizard/wizard-router.mod.server";
import { createTRPCRouter } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

export const appRouter = createTRPCRouter({
  wizard: wizardRouter,
});

export type AppRouter = typeof appRouter;

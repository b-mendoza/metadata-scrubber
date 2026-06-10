import { fileUploaderRouter } from "#/domains/file-uploader/routers/file-uploader-router.mod.server";
import { wizardRouter } from "#/domains/wizard/routers/wizard-router.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
  createTRPCRouter,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";

export const appRouter = createTRPCRouter({
  fileUploader: fileUploaderRouter,
  wizard: wizardRouter,
});

export type AppRouter = typeof appRouter;

const createCaller = createCallerFactory(appRouter);

export const caller = (request: Request) => {
  return createCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

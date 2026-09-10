import { TRPCError } from "@trpc/server";
import ky from "ky";
import { expect, vi } from "vitest";

import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import { wizardRouter } from "./wizard-router.mod.server";

const createWizardCaller = createCallerFactory(wizardRouter);

// Each test file must hoist `vi.mock` for the app-bindings module. This helper
// replaces the `getAppBindings` return value with `vi.mocked`.
export const callerForRequest = (request: Request, backendBaseUrl: URL) => {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: backendBaseUrl }),
    workflowHttpClient: createWorkflowHttpClient(backendBaseUrl),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

export const requireTRPCError = async (
  operation: Promise<unknown>,
): Promise<TRPCError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    if (error instanceof TRPCError) {
      return error;
    }
  }
  expect.fail("the workflow procedure must reject with a TRPCError");
};

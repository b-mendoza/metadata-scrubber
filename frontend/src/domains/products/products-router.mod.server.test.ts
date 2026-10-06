import { TRPCError } from "@trpc/server";
import type { BeforeRequestHook } from "ky";
import ky from "ky";
import { expect, test, vi } from "vitest";

import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import {
  BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  productsRouter,
} from "./products-router.mod.server";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const createProductsCaller = createCallerFactory(productsRouter);

test("getMessage maps a rejected backend health request to BAD_GATEWAY", async () => {
  const backendHealthFailure = new Error("backend health request failed");
  const request = new Request("https://frontend.test/");
  const beforeRequest = vi.fn<BeforeRequestHook>((): never => {
    throw backendHealthFailure;
  });

  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({
      baseUrl: new URL("https://backend.test/"),
      hooks: {
        beforeRequest: [beforeRequest],
      },
    }),
    workflowHttpClient: ky.create({
      baseUrl: new URL("https://backend.test/"),
    }),
  });

  let failure: unknown = null;
  try {
    await createProductsCaller(createTRPCRequestContext(request), {
      signal: request.signal,
    }).getMessage();
  } catch (error) {
    failure = error;
  }

  expect.assert(failure instanceof TRPCError);
  expect(failure.code).toBe("BAD_GATEWAY");
  expect(failure.message).toBe(BACKEND_HEALTH_CHECK_FAILURE_MESSAGE);
  expect(failure.cause).toBe(backendHealthFailure);
  const [[beforeRequestState] = []] = beforeRequest.mock.calls;
  expect(beforeRequestState?.request).toMatchObject({
    method: "GET",
    url: "https://backend.test/api/health",
  });
});

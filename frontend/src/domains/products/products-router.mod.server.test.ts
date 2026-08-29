import { TRPCError } from "@trpc/server";
import ky from "ky";
import { expect, test, vi } from "vitest";

import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import {
  BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  productsRouter,
} from "./products-router.mod.server";

vi.mock(
  import("#/shared/middlewares/application-bindings/application-bindings.mod"),
  () => ({
    getApplicationBindings: vi.fn(),
  }),
);

const createProductsCaller = createCallerFactory(productsRouter);

test("getMessage maps a rejected backend health request to BAD_GATEWAY", async () => {
  const backendHealthFailure = new Error("backend health request failed");
  const request = new Request("https://frontend.test/");

  vi.mocked(getApplicationBindings).mockReturnValue({
    env: environmentSchema.parse({
      BACKEND_URL: "https://backend.test/",
    }),
    httpClient: ky.create({
      baseUrl: new URL("https://backend.test/"),
      hooks: {
        beforeRequest: [
          (): never => {
            throw backendHealthFailure;
          },
        ],
      },
    }),
  });

  try {
    await createProductsCaller(createTRPCRequestContext(request), {
      signal: request.signal,
    }).getMessage();
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    if (!(error instanceof TRPCError)) {
      expect.fail("getMessage must reject with a TRPCError");
    }

    expect(error.code).toBe("BAD_GATEWAY");
    expect(error.message).toBe(BACKEND_HEALTH_CHECK_FAILURE_MESSAGE);
    expect(error.cause).toBe(backendHealthFailure);
    return;
  }

  expect.fail("getMessage must reject");
});

test("getMessage returns the reachable backend health status", async () => {
  const reachableHealthResponse = {
    status: "reachable",
  } as const;
  const request = new Request("https://frontend.test/");

  vi.mocked(getApplicationBindings).mockReturnValue({
    env: environmentSchema.parse({
      BACKEND_URL: "https://backend.test/",
    }),
    httpClient: ky.create({
      baseUrl: new URL("https://backend.test/"),
      hooks: {
        beforeRequest: [(): Response => Response.json(reachableHealthResponse)],
      },
    }),
  });

  const message = await createProductsCaller(
    createTRPCRequestContext(request),
    {
      signal: request.signal,
    },
  ).getMessage();

  expect(message).toEqual(reachableHealthResponse);
});

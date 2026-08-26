import { setImmediate } from "node:timers/promises";
import { promisify } from "node:util";

import ky from "ky";
import { expect, test, vi } from "vitest";

import type * as applicationBindingsModule from "#/shared/middlewares/application-bindings/application-bindings.mod";

import {
  BACKEND_HEALTH_ATTEMPT_TIMEOUT_MS,
  BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS,
  BACKEND_HEALTH_RETRY_LIMIT,
  BACKEND_HEALTH_TOTAL_TIMEOUT_MS,
  PRODUCTS_RESPONSE_DELAY_MS,
  productsRouter,
} from "./products-router.mod.server";

const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_OK_STATUS = 200;

const { getApplicationBindingsMock } = vi.hoisted(() => ({
  getApplicationBindingsMock: vi.fn(() => ({
    env: {
      BACKEND_URL: "https://backend.example.test",
    },
  })),
}));

vi.mock(
  "#/shared/middlewares/application-bindings/application-bindings.mod",
  async (importOriginal) => {
    const original = await importOriginal<typeof applicationBindingsModule>();

    return {
      ...original,
      getApplicationBindings: getApplicationBindingsMock,
    };
  },
);

test("rejects HTTP 400 even when the backend health payload is valid", async () => {
  interface BackendHealthResponse {
    status: "reachable";
  }

  const backendHealthResponse = {
    status: "reachable",
  } satisfies BackendHealthResponse;

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(backendHealthResponse, {
      status: HTTP_BAD_REQUEST_STATUS,
    }),
  );

  const abortController = new AbortController();
  const caller = productsRouter.createCaller(
    {
      signal: abortController.signal,
    },
    {
      signal: abortController.signal,
    },
  );

  await expect(caller.getMessage()).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  });
});

test("returns a safe error when the backend health payload is invalid", async () => {
  interface InvalidBackendHealthResponse {
    status: "unreachable";
  }

  const invalidBackendHealthResponse = {
    status: "unreachable",
  } satisfies InvalidBackendHealthResponse;

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(invalidBackendHealthResponse, {
      status: HTTP_OK_STATUS,
    }),
  );

  const abortController = new AbortController();
  const caller = productsRouter.createCaller(
    {
      signal: abortController.signal,
    },
    {
      signal: abortController.signal,
    },
  );

  await expect(caller.getMessage()).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
  });
});

test("wires the exact backend health URL and ky policy", async () => {
  interface BackendHealthResponse {
    status: "reachable";
  }

  const backendHealthResponse = {
    status: "reachable",
  } satisfies BackendHealthResponse;
  const mockedKyResponse = Object.assign(
    Promise.resolve(Response.json(backendHealthResponse)),
    {
      arrayBuffer: vi.fn(),
      blob: vi.fn(),
      bytes: vi.fn(),
      formData: vi.fn(),
      json: vi.fn().mockResolvedValue(backendHealthResponse),
      text: vi.fn(),
    },
  );
  const kyGetMock = vi.spyOn(ky, "get").mockReturnValue(mockedKyResponse);
  const abortController = new AbortController();
  const caller = productsRouter.createCaller(
    {
      signal: abortController.signal,
    },
    {
      signal: abortController.signal,
    },
  );

  await caller.getMessage();

  expect(kyGetMock).toHaveBeenCalledOnce();

  const [kyCall] = kyGetMock.mock.calls;
  if (kyCall == null) {
    throw new Error("The ky.get mock did not record the expected call.");
  }

  const [, kyOptions] = kyCall;
  if (kyOptions?.signal == null) {
    throw new Error("The ky.get call did not include the expected signal.");
  }

  expect(kyOptions.signal).toBeInstanceOf(AbortSignal);
  expect(kyGetMock).toHaveBeenCalledWith(
    new URL("https://backend.example.test/api/health"),
    {
      retry: {
        backoffLimit: BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS,
        jitter: true,
        limit: BACKEND_HEALTH_RETRY_LIMIT,
        maxRetryAfter: BACKEND_HEALTH_RETRY_DELAY_LIMIT_MS,
        retryOnTimeout: false,
      },
      signal: kyOptions.signal,
      throwHttpErrors: true,
      timeout: BACKEND_HEALTH_ATTEMPT_TIMEOUT_MS,
      totalTimeout: BACKEND_HEALTH_TOTAL_TIMEOUT_MS,
    },
  );
});

test("resolves getProducts only after PRODUCTS_RESPONSE_DELAY_MS", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout"],
  });
  vi.doMock("node:timers/promises", () => {
    const fakeSetTimeout = globalThis.setTimeout;
    const setTimeoutWithFakeClock = promisify(
      (delayMilliseconds: number, callback: () => void): void => {
        fakeSetTimeout(callback, delayMilliseconds);
      },
    );

    return {
      default: {
        setTimeout: setTimeoutWithFakeClock,
      },
      setTimeout: setTimeoutWithFakeClock,
    };
  });

  try {
    vi.resetModules();
    const { productsRouter: productsRouterWithFakeTimer } =
      await import("./products-router.mod.server");
    const abortController = new AbortController();
    const caller = productsRouterWithFakeTimer.createCaller(
      {
        signal: abortController.signal,
      },
      {
        signal: abortController.signal,
      },
    );
    const productsPromise = caller.getProducts();
    const resolutionObserver = vi.fn();
    const observedProductsPromise = productsPromise.then(resolutionObserver);

    expect(resolutionObserver).not.toHaveBeenCalled();

    await setImmediate();
    expect(resolutionObserver).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PRODUCTS_RESPONSE_DELAY_MS);
    await observedProductsPromise;

    expect(resolutionObserver).toHaveBeenCalledOnce();
  } finally {
    vi.doUnmock("node:timers/promises");
    vi.useRealTimers();
    vi.resetModules();
  }
});

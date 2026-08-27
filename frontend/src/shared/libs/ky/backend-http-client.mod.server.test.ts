import type * as kyModule from "ky";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("ky");
  vi.resetModules();
});

test("creates the backend HTTP client with the shared request policy", async () => {
  vi.resetModules();

  const clientSentinel = Symbol("backend HTTP client");
  const kyCreateMock = vi.fn(() => clientSentinel);

  vi.doMock("ky", async (importOriginal) => {
    const original = await importOriginal<typeof kyModule>();

    return {
      ...original,
      default: {
        create: kyCreateMock,
      },
    };
  });

  const backendHttpClientModule =
    await import("./backend-http-client.mod.server");

  expect(kyCreateMock).toHaveBeenCalledOnce();
  expect(kyCreateMock).toHaveBeenCalledWith({
    retry: {
      backoffLimit: backendHttpClientModule.BACKEND_HTTP_RETRY_DELAY_LIMIT_MS,
      jitter: true,
      limit: backendHttpClientModule.BACKEND_HTTP_RETRY_LIMIT,
      maxRetryAfter: backendHttpClientModule.BACKEND_HTTP_RETRY_DELAY_LIMIT_MS,
      retryOnTimeout: false,
    },
    throwHttpErrors: true,
    timeout: backendHttpClientModule.BACKEND_HTTP_ATTEMPT_TIMEOUT_MS,
    totalTimeout: backendHttpClientModule.BACKEND_HTTP_TOTAL_TIMEOUT_MS,
  });
  expect(backendHttpClientModule.backendHttpClient).toBe(clientSentinel);
});

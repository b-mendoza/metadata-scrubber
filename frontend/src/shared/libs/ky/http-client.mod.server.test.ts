import { HTTPError, TimeoutError } from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { BAD_GATEWAY_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  createHttpClient,
  HTTP_CLIENT_ATTEMPT_TIMEOUT_MS,
  HTTP_CLIENT_RETRY_LIMIT,
} from "./http-client.mod.server";

const ONE_MILLISECOND_MS = 1;
const INITIAL_FETCH_ATTEMPT_COUNT = 1;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a hung fetch rejects as a Ky timeout at 3000 ms and fetch runs once", async () => {
  vi.useFakeTimers();

  const fetchMock = vi.fn(async (): Promise<Response> => {
    const hungResponse = await Promise.race<Response>([]);
    return hungResponse;
  });
  vi.stubGlobal("fetch", fetchMock);

  const backendBaseUrl = new URL("https://backend.test/");
  const httpClient = createHttpClient(backendBaseUrl);
  const healthPath = "/api/health";

  const requestPromise = httpClient.get(healthPath);
  const onSettle = vi.fn();
  void requestPromise.then(onSettle, onSettle);

  await vi.advanceTimersByTimeAsync(
    HTTP_CLIENT_ATTEMPT_TIMEOUT_MS - ONE_MILLISECOND_MS,
  );

  expect(onSettle).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);

  expect(onSettle).toHaveBeenCalledOnce();

  await expect(requestPromise).rejects.toBeInstanceOf(TimeoutError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a 502 response rejects as an HTTP error and fetch runs twice", async () => {
  vi.useFakeTimers();

  const fetchMock = vi.fn(async (): Promise<Response> => {
    const badGatewayResponse = new Response("Bad Gateway", {
      status: BAD_GATEWAY_STATUS_CODE,
    });
    const resolvedResponse = await Promise.resolve(badGatewayResponse);
    return resolvedResponse;
  });
  vi.stubGlobal("fetch", fetchMock);

  const backendBaseUrl = new URL("https://backend.test/");
  const httpClient = createHttpClient(backendBaseUrl);
  const healthPath = "/api/health";

  const requestPromise = httpClient.get(healthPath);
  const onReject = vi.fn((error: unknown) => error);
  void requestPromise.catch(onReject);
  await vi.runAllTimersAsync();

  await expect(requestPromise).rejects.toBeInstanceOf(HTTPError);

  const [error] = onReject.mock.lastCall ?? [];
  if (!(error instanceof HTTPError)) {
    expect.fail("the 502 response must reject with an HTTPError");
  }

  const { status } = error.response;
  expect(status).toBe(BAD_GATEWAY_STATUS_CODE);
  expect(fetchMock).toHaveBeenCalledTimes(
    HTTP_CLIENT_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT,
  );
});

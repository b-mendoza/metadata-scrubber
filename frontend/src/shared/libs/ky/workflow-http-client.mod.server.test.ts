import { HTTPError, TimeoutError } from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  createWorkflowHttpClient,
  WORKFLOW_DRY_RUN_TIMEOUT_MS,
  WORKFLOW_NO_RETRY_OPTIONS,
  WORKFLOW_ONE_SHOT_TIMEOUT_MS,
  WORKFLOW_RETRY_LIMIT,
  WORKFLOW_RETRY_MAX_RETRY_AFTER_MS,
  WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
} from "./workflow-http-client.mod.server";

const BACKEND_BASE_URL = new URL("https://backend.test/");
const WORKFLOW_PATH = "/api/files/dry-run";
const ONE_SECOND_MS = 1000;
const FIVE_SECONDS_MS = 5000;
const ONE_MILLISECOND_MS = 1;
const INITIAL_FETCH_ATTEMPT_COUNT = 1;
const TWO_FETCH_ATTEMPTS = 2;

const unavailableResponse = (): Response => {
  return Response.json(
    { error: "processing capacity temporarily unavailable" },
    {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    },
  );
};

const resolveAfterMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const captureFailure = async (
  operation: PromiseLike<Response>,
): Promise<unknown> => {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  expect.fail("the workflow request must reject");
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("an eligible 503 waits for the server Retry-After value before it retries", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { error: "processing capacity temporarily unavailable" },
        {
          headers: { "Retry-After": "1" },
          status: SERVICE_UNAVAILABLE_STATUS_CODE,
        },
      ),
    )
    .mockResolvedValueOnce(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const responsePromise = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
  });
  await resolveAfterMicrotasks();

  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(ONE_SECOND_MS - ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  await expect(responsePromise).resolves.toBeInstanceOf(Response);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("an eligible 503 Retry-After value is capped at 4000 ms", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { error: "processing capacity temporarily unavailable" },
        {
          headers: { "Retry-After": "5" },
          status: SERVICE_UNAVAILABLE_STATUS_CODE,
        },
      ),
    )
    .mockResolvedValueOnce(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const responsePromise = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
  });
  await resolveAfterMicrotasks();

  await vi.advanceTimersByTimeAsync(
    WORKFLOW_RETRY_MAX_RETRY_AFTER_MS - ONE_MILLISECOND_MS,
  );
  expect(fetchMock).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  await expect(responsePromise).resolves.toBeInstanceOf(Response);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("two eligible 503 responses produce three total attempts and then succeed", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(unavailableResponse())
    .mockResolvedValueOnce(unavailableResponse())
    .mockResolvedValueOnce(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const responsePromise = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
  });
  await vi.runAllTimersAsync();

  await expect(responsePromise).resolves.toBeInstanceOf(Response);
  expect(fetchMock).toHaveBeenCalledTimes(
    WORKFLOW_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT,
  );
});

test("eligible 503 responses stop after three total attempts", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(unavailableResponse())
    .mockResolvedValueOnce(unavailableResponse())
    .mockResolvedValueOnce(unavailableResponse());
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const failurePromise = captureFailure(
    client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
      timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
      totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    }),
  );
  await vi.runAllTimersAsync();

  const error = await failurePromise;
  expect(error).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledTimes(
    WORKFLOW_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT,
  );
});

test.each([
  ["missing", null],
  ["empty", ""],
  ["zero", "0"],
  ["negative", "-1"],
  ["decimal", "1.5"],
  ["HTTP date", "Wed, 21 Oct 2015 07:28:00 GMT"],
  ["non-number", "later"],
  ["unsafe integer", "9007199254740992"],
])("a 503 with a %s Retry-After value does not retry", async (_name, value) => {
  vi.useFakeTimers();
  const headers = new Headers();
  if (value != null) {
    headers.set("Retry-After", value);
  }
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { error: "processing capacity temporarily unavailable" },
        { headers, status: SERVICE_UNAVAILABLE_STATUS_CODE },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const failurePromise = captureFailure(
    client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
      timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
      totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
    }),
  );
  await vi.runAllTimersAsync();

  const error = await failurePromise;
  expect(error).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a one-shot request does not retry any upstream failure", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(unavailableResponse());
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const failurePromise = captureFailure(
    client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_NO_RETRY_OPTIONS,
      timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
      totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
    }),
  );
  await vi.runAllTimersAsync();

  const error = await failurePromise;
  expect(error).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("the total operation budget stops a retry during the server delay", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(unavailableResponse());
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const failurePromise = captureFailure(
    client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
      timeout: FIVE_SECONDS_MS,
      totalTimeout: ONE_SECOND_MS - ONE_MILLISECOND_MS,
    }),
  );
  await vi.runAllTimersAsync();

  const error = await failurePromise;
  expect(error).toBeInstanceOf(TimeoutError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

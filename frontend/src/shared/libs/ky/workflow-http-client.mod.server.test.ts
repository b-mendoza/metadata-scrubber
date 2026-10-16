// eslint-disable-next-line vitest/no-import-node-test -- Node mocks control native promise timers that Vitest leaves on the real clock.
import { mock } from "node:test";
import timers from "node:timers/promises";

import { HTTPError, NetworkError, TimeoutError } from "ky";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  INTERNAL_SERVER_ERROR_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  TOO_MANY_REQUESTS_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  createWorkflowHttpClient,
  WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
} from "./workflow-http-client.mod.server";

const BACKEND_BASE_URL = new URL("https://backend.test/");
const WORKFLOW_PATH = "/api/files/dry-run";
const ONE_MILLISECOND_MS = 1;
const HALF_JITTER_SAMPLE = 0.5;
const INITIAL_FETCH_ATTEMPT_COUNT = 1;
const TWO_FETCH_ATTEMPTS = 2;
const THREE_FETCH_ATTEMPTS = 3;
const SERVER_RETRY_DELAY_MS = 1000;
const CAPPED_SERVER_RETRY_DELAY_MS = 4000;
const HALF_JITTER_FIRST_DELAY_MS = 150;
const INITIAL_FETCH_TIME_MS = 0;
const TOTAL_BUDGET_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;
const FIRST_ATTEMPT_TOTAL_BUDGET_MS = 20_000;

beforeEach(() => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});

afterEach(() => {
  mock.timers.reset();
});

// 0, 0.5, and near-1 samples detect missing, fixed, or non-exponential jitter.
test.each([
  { sample: 0, firstDelay: 0, secondDelay: 0 },
  { sample: 0.5, firstDelay: 150, secondDelay: 300 },
  { sample: 0.999, firstDelay: 299, secondDelay: 599 },
])(
  "eligible retries use full jitter at sample $sample",
  async ({ sample, firstDelay, secondDelay }) => {
    vi.spyOn(Math, "random").mockReturnValue(sample);
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      fetchTimes.push(Date.now());
      await Promise.resolve();
      return new Response(null, {
        headers: { "Retry-After": "1" },
        status: SERVICE_UNAVAILABLE_STATUS_CODE,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createWorkflowHttpClient(BACKEND_BASE_URL);

    const operation = client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    });
    let failure: unknown = null;
    void operation.catch((error: unknown) => {
      failure = error;
    });
    const firstGap = SERVER_RETRY_DELAY_MS + firstDelay;
    const secondGap = SERVER_RETRY_DELAY_MS + secondDelay;
    await timers.setImmediate();
    mock.timers.tick(
      Math.max(INITIAL_FETCH_TIME_MS, firstDelay - ONE_MILLISECOND_MS),
    );
    await timers.setImmediate();
    mock.timers.tick(Math.min(firstDelay, ONE_MILLISECOND_MS));
    await timers.setImmediate();
    mock.timers.tick(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
    await timers.setImmediate();
    expect(fetchTimes).toEqual([INITIAL_FETCH_TIME_MS]);
    mock.timers.tick(ONE_MILLISECOND_MS);
    await timers.setImmediate();
    expect(fetchTimes).toEqual([INITIAL_FETCH_TIME_MS, firstGap]);
    mock.timers.tick(
      Math.max(INITIAL_FETCH_TIME_MS, secondDelay - ONE_MILLISECOND_MS),
    );
    await timers.setImmediate();
    mock.timers.tick(Math.min(secondDelay, ONE_MILLISECOND_MS));
    await timers.setImmediate();
    mock.timers.tick(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
    await timers.setImmediate();
    expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
    mock.timers.tick(ONE_MILLISECOND_MS);
    await timers.setImmediate();
    expect(fetchTimes).toEqual([
      INITIAL_FETCH_TIME_MS,
      firstGap,
      firstGap + secondGap,
    ]);
    expect(failure).toBeInstanceOf(HTTPError);
    await timers.setImmediate();
    mock.timers.runAll();
    await timers.setImmediate();
    expect(fetchMock).toHaveBeenCalledTimes(THREE_FETCH_ATTEMPTS);
  },
);

test("a longer Retry-After adds client jitter to the capped server delay", async () => {
  vi.spyOn(Math, "random").mockReturnValue(HALF_JITTER_SAMPLE);
  const fetchTimes: number[] = [];
  const fetchMock = vi.fn<typeof fetch>(async () => {
    fetchTimes.push(Date.now());
    await Promise.resolve();
    if (fetchTimes.length === INITIAL_FETCH_ATTEMPT_COUNT) {
      return new Response(null, {
        headers: { "Retry-After": "5" },
        status: SERVICE_UNAVAILABLE_STATUS_CODE,
      });
    }
    return new Response(null);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  });
  const retryDelay = CAPPED_SERVER_RETRY_DELAY_MS + HALF_JITTER_FIRST_DELAY_MS;
  await timers.setImmediate();
  mock.timers.tick(HALF_JITTER_FIRST_DELAY_MS - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  mock.timers.tick(CAPPED_SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchTimes).toEqual([INITIAL_FETCH_TIME_MS]);
  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchTimes).toEqual([INITIAL_FETCH_TIME_MS, retryDelay]);
  expect(await operation).toBeInstanceOf(Response);
});

test.each([
  ["zero", "0"],
  ["Number-readable non-digit", "1e3"],
  ["no-break-space prefixed digits", "\u{00A0}1"],
  ["HTTP date", "Wed, 21 Oct 2015 07:28:00 GMT"],
  ["unsafe integer", "9007199254740992"],
  ["missing", null],
])("a 503 with a %s Retry-After value does not retry", async (_name, value) => {
  const headers = new Headers();
  if (value != null) {
    headers.set("Retry-After", value);
  }
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers,
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  });
  let failure: unknown = null;
  void operation.catch((error: unknown) => {
    failure = error;
  });
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect(failure).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test.each([TOO_MANY_REQUESTS_STATUS_CODE, INTERNAL_SERVER_ERROR_STATUS_CODE])(
  "a %s with a valid Retry-After value does not retry",
  async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { "Retry-After": "1" },
        status,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createWorkflowHttpClient(BACKEND_BASE_URL);

    const operation = client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    });
    let failure: unknown = null;
    void operation.catch((error: unknown) => {
      failure = error;
    });
    await timers.setImmediate();
    mock.timers.runAll();
    await timers.setImmediate();
    expect(failure).toBeInstanceOf(HTTPError);
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

test("GET 503 with a valid Retry-After does not retry", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.get(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  });
  let failure: unknown = null;
  void operation.catch((error: unknown) => {
    failure = error;
  });
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect(failure).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("workflow retries reject a network failure after one attempt", async () => {
  const networkFailure = new TypeError("fetch failed");
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(networkFailure);
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  });
  let failure: unknown = null;
  void operation.catch((error: unknown) => {
    failure = error;
  });
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect.assert(failure instanceof NetworkError);
  expect(failure.cause).toBe(networkFailure);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a first-attempt timeout does not retry", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockReturnValue(Promise.race<Response>([]));
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    totalTimeout: FIRST_ATTEMPT_TOTAL_BUDGET_MS,
  });
  let failure: unknown = null;
  void operation.catch((error: unknown) => {
    failure = error;
  });
  await timers.setImmediate();
  mock.timers.tick(DEFAULT_TIMEOUT_MS);
  await timers.setImmediate();
  expect(failure).toBeInstanceOf(TimeoutError);
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("caller cancellation stops the client jitter wait", async () => {
  vi.spyOn(Math, "random").mockReturnValue(HALF_JITTER_SAMPLE);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    signal: controller.signal,
  });
  let failure: unknown = null;
  void operation.catch((error: unknown) => {
    failure = error;
  });
  await timers.setImmediate();
  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  controller.abort();
  await timers.setImmediate();
  expect.assert(failure instanceof Error);
  expect(failure.name).toBe("AbortError");
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("the total budget can expire during the client jitter wait", async () => {
  vi.spyOn(Math, "random").mockReturnValue(HALF_JITTER_SAMPLE);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);
  const settle = vi.fn((outcome: unknown) => outcome);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
    totalTimeout: TOTAL_BUDGET_MS,
  });
  void operation.then(settle).catch(settle);
  await timers.setImmediate();
  mock.timers.tick(TOTAL_BUDGET_MS - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(settle).not.toHaveBeenCalled();
  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(settle).toHaveBeenCalledOnce();
  const [[failure] = []] = settle.mock.calls;
  expect(failure).toBeInstanceOf(TimeoutError);
  await timers.setImmediate();
  mock.timers.runAll();
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledOnce();
});

import { HTTPError, NetworkError } from "ky";
import { afterEach, expect, test, vi } from "vitest";

import {
  SERVICE_UNAVAILABLE_STATUS_CODE,
  TOO_MANY_REQUESTS_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  createWorkflowHttpClient,
  WORKFLOW_RETRY_LIMIT,
  WORKFLOW_RETRY_MAX_RETRY_AFTER_MS,
  WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
} from "./workflow-http-client.mod.server";

const BACKEND_BASE_URL = new URL("https://backend.test/");
const WORKFLOW_PATH = "/api/files/dry-run";
const ONE_MILLISECOND_MS = 1;
const INITIAL_FETCH_ATTEMPT_COUNT = 1;
const TWO_FETCH_ATTEMPTS = 2;

afterEach(() => {
  vi.useRealTimers();
});

test("an eligible 503 Retry-After value is capped at the configured maximum", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, {
        headers: { "Retry-After": "5" },
        status: SERVICE_UNAVAILABLE_STATUS_CODE,
      }),
    )
    .mockResolvedValue(new Response(null));
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const operation = client.post(WORKFLOW_PATH, {
    retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
  });
  let outcome: unknown = null;
  void operation
    .then((response) => {
      outcome = response;
    })
    .catch((error: unknown) => {
      outcome = error;
    });

  await vi.advanceTimersByTimeAsync(
    WORKFLOW_RETRY_MAX_RETRY_AFTER_MS - ONE_MILLISECOND_MS,
  );
  expect(fetchMock).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
  expect(outcome).toBeInstanceOf(Response);
});

test("eligible 503 responses stop after the configured retry limit", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": "1" },
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
  await vi.runAllTimersAsync();

  expect(failure).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledTimes(
    WORKFLOW_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT,
  );
});

test.each([
  ["zero", "0"],
  ["Number-readable non-digit", "1e3"],
  ["no-break-space prefixed digits", "\u{00A0}1"],
  ["HTTP date", "Wed, 21 Oct 2015 07:28:00 GMT"],
  ["unsafe integer", "9007199254740992"],
])("a 503 with a %s Retry-After value does not retry", async (_name, value) => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": value },
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
  await vi.runAllTimersAsync();

  expect(failure).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a 429 with a valid Retry-After value does not retry", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      headers: { "Retry-After": "1" },
      status: TOO_MANY_REQUESTS_STATUS_CODE,
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
  await vi.runAllTimersAsync();

  expect(failure).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("workflow retries reject a network failure after one attempt", async () => {
  vi.useFakeTimers();
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
  await vi.runAllTimersAsync();

  expect.assert(failure instanceof NetworkError);
  expect(failure.cause).toBe(networkFailure);
  expect(fetchMock).toHaveBeenCalledOnce();
});

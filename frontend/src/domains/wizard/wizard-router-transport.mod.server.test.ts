import { once } from "node:events";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import type { BackendErrorResponse } from "./wizard-contracts.mod.server";
import {
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  SCRUB_FILE_FAILURE_MESSAGE,
  wizardRouter,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
} from "./wizard-router.mod.server";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const MINIMUM_FILE_SIZE_BYTES = 1;
const SERVER_RETRY_DELAY_MS = 1000;
const ONE_MILLISECOND_MS = 1;
const TWO_FETCH_ATTEMPTS = 2;
const EXPECTED_DRY_RUN_TIMEOUT_MS = 90_000;
const EXPECTED_SCRUB_TIMEOUT_MS = 240_000;

const createWizardCaller = createCallerFactory(wizardRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

afterEach(() => {
  vi.useRealTimers();
});

test("an unclassified transport failure maps to BAD_GATEWAY without public details", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: MINIMUM_FILE_SIZE_BYTES,
  };
  const providerDetails = "provider-credential-sentinel";
  const transportFailure = new Error(providerDetails);
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(transportFailure);
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  let failure: unknown = null;
  try {
    await callerForRequest(request).createUpload(input);
  } catch (error) {
    failure = error;
  }

  expect.assert(failure instanceof TRPCError);
  expect(failure.code).toBe("BAD_GATEWAY");
  expect(failure.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
  expect(failure.message).not.toContain(providerDetails);
  expect(failure.cause).toBe(transportFailure);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("dryRun uses its total timeout after a server-directed retry", async () => {
  vi.useFakeTimers();
  const input: RouterInputs["wizard"]["dryRun"] = { storageKey: STORAGE_KEY };
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockReturnValue(Promise.race<Response>([]))
    .mockResolvedValueOnce(
      Response.json(response, {
        headers: { "Retry-After": "1" },
        status: SERVICE_UNAVAILABLE_STATUS_CODE,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const operation = callerForRequest(request).dryRun(input);
  const settle = vi.fn((outcome: unknown) => outcome);
  void operation.then(settle).catch(settle);

  await vi.advanceTimersByTimeAsync(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);

  await vi.advanceTimersByTimeAsync(
    EXPECTED_DRY_RUN_TIMEOUT_MS - SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS,
  );
  expect(settle).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  expect(settle).toHaveBeenCalledOnce();
  const [[error] = []] = settle.mock.calls;
  expect.assert(error instanceof TRPCError);
  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("scrubFile uses its total timeout after a server-directed retry", async () => {
  vi.useFakeTimers();
  const input: RouterInputs["wizard"]["scrubFile"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockReturnValue(Promise.race<Response>([]))
    .mockResolvedValueOnce(
      Response.json(response, {
        headers: { "Retry-After": "1" },
        status: SERVICE_UNAVAILABLE_STATUS_CODE,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const operation = callerForRequest(request).scrubFile(input);
  const settle = vi.fn((outcome: unknown) => outcome);
  void operation.then(settle).catch(settle);

  await vi.advanceTimersByTimeAsync(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);

  await vi.advanceTimersByTimeAsync(
    EXPECTED_SCRUB_TIMEOUT_MS - SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS,
  );
  expect(settle).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(ONE_MILLISECOND_MS);
  expect(settle).toHaveBeenCalledOnce();
  const [[error] = []] = settle.mock.calls;
  expect.assert(error instanceof TRPCError);
  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(SCRUB_FILE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("getWorkflowConfig rejects a backend 503 without a retry", async () => {
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  let failure: unknown = null;
  try {
    await callerForRequest(request).getWorkflowConfig();
  } catch (error) {
    failure = error;
  }

  expect.assert(failure instanceof TRPCError);
  expect(failure.code).toBe("SERVICE_UNAVAILABLE");
  expect(failure.message).toBe(WORKFLOW_CONFIG_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("caller cancellation maps safely and starts no extra fetch", async () => {
  const input: RouterInputs["wizard"]["dryRun"] = { storageKey: STORAGE_KEY };
  const fetchStarted = Promise.withResolvers<boolean>();
  const fetchMock = vi.fn<typeof fetch>(
    async (fetchInput): Promise<Response> => {
      const backendRequest =
        fetchInput instanceof Request ? fetchInput : new Request(fetchInput);
      fetchStarted.resolve(true);
      await once(backendRequest.signal, "abort");
      throw new DOMException("aborted", "AbortError");
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const request = new Request(FRONTEND_URL, { signal: controller.signal });

  const operation = callerForRequest(request).dryRun(input);
  await fetchStarted.promise;
  controller.abort();
  let failure: unknown = null;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }

  expect.assert(failure instanceof TRPCError);
  expect(failure.code).toBe("BAD_GATEWAY");
  expect(failure.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

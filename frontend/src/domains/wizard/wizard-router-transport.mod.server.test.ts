import { once } from "node:events";

import { afterEach, expect, test, vi } from "vitest";

import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";

import type {
  BackendErrorResponse,
  DryRunInput,
  RefreshDownloadGrantInput,
} from "./wizard-contracts.mod.server";
import {
  CONFIRM_DELETE_FAILURE_MESSAGE,
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
} from "./wizard-router.mod.server";
import {
  callerForRequest,
  requireTRPCError,
} from "./wizard-router.test-helper";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const MINIMUM_FILE_SIZE_BYTES = 1;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
  expect(error.message).not.toContain(providerDetails);
  expect(error.cause).toBe(transportFailure);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a workflow client timeout maps to TIMEOUT without a retry", async () => {
  vi.useFakeTimers();
  const input: RefreshDownloadGrantInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockReturnValue(Promise.race<Response>([]));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).refreshDownloadGrant(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;

  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("caller cancellation maps safely and starts no extra fetch", async () => {
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const fetchMock = vi.fn<typeof fetch>(
    async (fetchInput): Promise<Response> => {
      const backendRequest =
        fetchInput instanceof Request ? fetchInput : new Request(fetchInput);
      await once(backendRequest.signal, "abort");
      throw new DOMException("aborted", "AbortError");
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const request = new Request(FRONTEND_URL, { signal: controller.signal });

  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).dryRun(input),
  );
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  controller.abort();
  const error = await errorPromise;

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("getWorkflowConfig does not retry a processing-eligible 503", async () => {
  vi.useFakeTimers();
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      status: 503,
      headers: { "Retry-After": "2" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).getWorkflowConfig(),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;
  expect(error.code).toBe("SERVICE_UNAVAILABLE");
  expect(error.message).toBe(WORKFLOW_CONFIG_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("createUpload does not retry a processing-eligible 503", async () => {
  vi.useFakeTimers();
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: MINIMUM_FILE_SIZE_BYTES,
  };
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      status: 503,
      headers: { "Retry-After": "2" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;
  expect(error.code).toBe("SERVICE_UNAVAILABLE");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("refreshDownloadGrant does not retry a processing-eligible 503", async () => {
  vi.useFakeTimers();
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: STORAGE_KEY,
    etag: CANONICAL_ETAG,
  };
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      status: 503,
      headers: { "Retry-After": "2" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).refreshDownloadGrant(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;
  expect(error.code).toBe("SERVICE_UNAVAILABLE");
  expect(error.message).toBe(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("confirmDelete does not retry a processing-eligible 503", async () => {
  vi.useFakeTimers();
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: STORAGE_KEY,
  };
  const response: BackendErrorResponse = {
    error: "processing capacity temporarily unavailable",
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      status: 503,
      headers: { "Retry-After": "2" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).confirmDelete(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;
  expect(error.code).toBe("SERVICE_UNAVAILABLE");
  expect(error.message).toBe(CONFIRM_DELETE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

import { once } from "node:events";

import { CancelledError } from "@tanstack/react-query";
import { getRequest } from "@tanstack/react-start/server";
import ky from "ky";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import {
  getRouterContext,
  initializeTRPCClient,
} from "#/shared/libs/trpc/client/client.mod";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import type {
  BackendErrorResponse,
  DryRunInput,
  DryRunResponse,
  RefreshDownloadGrantInput,
  RefreshDownloadGrantResponse,
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

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequest: vi.fn(),
}));

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

test.each([
  ["dryRun", true],
  ["refreshDownloadGrant", true],
  ["dryRun", false],
  ["refreshDownloadGrant", false],
] as const)(
  "SSR Query %s with abort=%s preserves its backend transport contract",
  async (procedure, abort) => {
    const inspected: DryRunResponse = {
      etag: CANONICAL_ETAG,
      fields: [
        {
          name: "title",
          label: "Title",
          preview: "private",
          originalByteSize: 7,
          action: "remove",
        },
      ],
    };
    const grant: RefreshDownloadGrantResponse = {
      downloadUrl: "https://downloads.test/report.pdf",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const response = procedure === "dryRun" ? inspected : grant;
    const pending = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<Request>();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const backendRequest = new Request(input, init);
      started.resolve(backendRequest);
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getRequest).mockReturnValue(new Request(FRONTEND_URL));
    vi.mocked(getAppBindings).mockReturnValue({
      httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
      workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
    });
    const { queryClient, trpc } = getRouterContext(
      initializeTRPCClient(new URL("/api/trpc", FRONTEND_URL)),
    );
    queryClient.mount();
    onTestFinished(() => {
      pending.resolve(Response.json(response));
      queryClient.clear();
      queryClient.unmount();
    });
    const settled = vi.fn<(outcome: unknown) => void>();
    const dryRunInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: STORAGE_KEY,
    };
    const grantInput: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: STORAGE_KEY,
      etag: CANONICAL_ETAG,
    };
    const operation =
      procedure === "dryRun"
        ? queryClient.query(
            trpc.wizard.dryRun.queryOptions(dryRunInput, {
              retry: false,
              staleTime: 0,
              gcTime: 0,
              trpc: { abortOnUnmount: true },
            }),
          )
        : queryClient.query(
            trpc.wizard.refreshDownloadGrant.queryOptions(grantInput, {
              retry: false,
              staleTime: 0,
              gcTime: 0,
              trpc: { abortOnUnmount: true },
            }),
          );
    void Promise.resolve(operation).then(settled).catch(settled);
    const backendRequest = await started.promise;
    expect(backendRequest.signal.aborted).toBe(false);
    if (abort) {
      await queryClient.cancelQueries();
      expect(backendRequest.signal.aborted).toBe(true);
      await vi.waitFor(() => {
        expect(settled).toHaveBeenCalledOnce();
      });
      expect(settled).toHaveBeenCalledWith(expect.any(CancelledError));
    } else {
      pending.resolve(Response.json(response));
      await expect(operation).resolves.toEqual(response);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(backendRequest.method).toBe("POST");
    expect(backendRequest.url).toBe(
      new URL(
        procedure === "dryRun"
          ? "/api/files/dry-run"
          : "/api/files/download-grant",
        BACKEND_BASE_URL,
      ).href,
    );
    await expect(backendRequest.clone().json()).resolves.toEqual(
      procedure === "dryRun" ? dryRunInput : grantInput,
    );
  },
);

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

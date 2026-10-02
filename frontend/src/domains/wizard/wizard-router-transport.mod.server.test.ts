import { once } from "node:events";

import { CancelledError, QueryClient } from "@tanstack/react-query";
import { getRequest } from "@tanstack/react-start/server";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import ky from "ky";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import type { WorkflowOutput } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { createTestTRPCClient } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { loadResult } from "#/routes/_wizard.result";
import { loadReview } from "#/routes/_wizard.review";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
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
const TWO_REQUESTS = 2;
const GRANT_LIFETIME_MS = 120_000;

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

test.each(["review", "result"] as const)(
  "%s overlapping same-key loaders keep separate requests when the old one aborts",
  async (step) => {
    const { request, client } = createTestTRPCClient();
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const loader = step === "review" ? loadReview : loadResult;
    const loaderDependencies: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const oldController = new AbortController();
    const newController = new AbortController();
    const oldResponse = Promise.withResolvers<WorkflowOutput>();
    const newResponse = Promise.withResolvers<WorkflowOutput>();
    request
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    const previous = loader({
      abortController: oldController,
      context: { trpc },
      deps: loaderDependencies,
    });
    const oldSettled = vi.fn();
    void Promise.resolve(previous).then(oldSettled).catch(oldSettled);
    const current = loader({
      abortController: newController,
      context: { trpc },
      deps: loaderDependencies,
    });
    const newSettled = vi.fn();
    void Promise.resolve(current).then(newSettled).catch(newSettled);
    onTestFinished(() => {
      oldController.abort();
      newController.abort();
      oldResponse.resolve({
        etag: loaderDependencies.etag,
        fields: [],
      } satisfies RouterOutputs["wizard"]["dryRun"]);
      newResponse.resolve({
        etag: loaderDependencies.etag,
        fields: [],
      } satisfies RouterOutputs["wizard"]["dryRun"]);
      queryClient.clear();
    });
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(TWO_REQUESTS);
    });
    oldController.abort();
    const [oldRequest, newRequest] = request.mock.calls;
    expect(oldRequest).toMatchObject([{ signal: { aborted: true } }]);
    expect(newRequest).toMatchObject([{ signal: { aborted: false } }]);
    await vi.waitFor(() => {
      expect(oldSettled).toHaveBeenCalledOnce();
    });
    await expect(previous).rejects.toMatchObject({ name: "AbortError" });
    expect(newSettled).not.toHaveBeenCalled();
    const inspected: RouterOutputs["wizard"]["dryRun"] = {
      etag: loaderDependencies.etag,
      fields: [
        {
          name: "title",
          label: "New title",
          preview: "new",
          originalByteSize: 3,
          action: "remove",
        },
      ],
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/new.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    newResponse.resolve(step === "review" ? inspected : grant);
    await expect(current).resolves.toEqual(
      step === "review"
        ? { revision: loaderDependencies, fields: inspected.fields }
        : { revision: loaderDependencies, grant },
    );
  },
);

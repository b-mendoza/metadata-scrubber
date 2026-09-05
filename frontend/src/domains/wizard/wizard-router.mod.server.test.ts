import { once } from "node:events";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import type {
  ConfirmDeleteInput,
  ConfirmDeleteResponse,
  DryRunInput,
  DryRunResponse,
  RefreshDownloadGrantInput,
  RefreshDownloadGrantResponse,
  ScrubFileInput,
  ScrubFileResponse,
  WorkflowConfig,
} from "./wizard-contracts.mod.server";
import {
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  wizardRouter,
} from "./wizard-router.mod.server";

vi.mock(
  import("#/shared/middlewares/application-bindings/application-bindings.mod"),
  () => ({
    getApplicationBindings: vi.fn(),
  }),
);

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";
const MINIMUM_FILE_SIZE_BYTES = 1;

const createWizardCaller = createCallerFactory(wizardRouter);

const setApplicationBindings = () => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
};

const callerForRequest = (request: Request) => {
  setApplicationBindings();
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

const requireTRPCError = async (
  operation: Promise<unknown>,
): Promise<TRPCError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    if (error instanceof TRPCError) {
      return error;
    }
  }
  expect.fail("the workflow procedure must reject with a TRPCError");
};

const onlyFetchRequest = (
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
): Request => {
  expect(fetchMock).toHaveBeenCalledOnce();
  const [firstFetchCall] = fetchMock.mock.calls;
  expect(firstFetchCall).toBeDefined();
  const [request] = firstFetchCall ?? [];
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request)) {
    expect.fail("Ky must call fetch with a Request");
  }
  return request;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("getWorkflowConfig returns the exact backend-owned byte limit", async () => {
  const response: WorkflowConfig = {
    maxFileSizeBytes: 7_340_032,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).getWorkflowConfig();

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("GET");
  expect(backendRequest.url).toBe("https://backend.test/api/files/config");
});

test("createUpload sends only its typed small-JSON contract", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 10_485_761,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: STORAGE_KEY,
    uploadUrl: "https://uploads.test/source.pdf",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).createUpload(input);

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/uploads");
  await expect(backendRequest.clone().json()).resolves.toEqual(input);
  expect(JSON.stringify(input)).not.toContain("fileBytes");
});

test("dryRun sends the storage key and returns a canonical reviewed revision", async () => {
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const response: DryRunResponse = {
    etag: CANONICAL_ETAG,
    fields: [
      {
        action: "remove",
        label: "Title",
        name: "title",
        originalByteSize: 7,
        preview: "private",
      },
    ],
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).dryRun(input);

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/dry-run");
  await expect(backendRequest.clone().json()).resolves.toEqual(input);
  expect(JSON.stringify(input)).not.toContain("fileBytes");
});

test("scrubFile forwards the exact reviewed ETag without file bytes", async () => {
  const input: ScrubFileInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: ScrubFileResponse = {
    result: { downloadUrl: DOWNLOAD_URL },
    status: "done",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).scrubFile(input);

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/scrub");
  await expect(backendRequest.clone().json()).resolves.toEqual(input);
  expect(JSON.stringify(input)).not.toContain("fileBytes");
});

test("refreshDownloadGrant targets one exact sanitized revision", async () => {
  const input: RefreshDownloadGrantInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: RefreshDownloadGrantResponse = {
    downloadUrl: DOWNLOAD_URL,
    expiresAt: "2026-09-01T12:15:00Z",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).refreshDownloadGrant(input);

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe(
    "https://backend.test/api/files/download-grant",
  );
  await expect(backendRequest.clone().json()).resolves.toEqual(input);
  expect(JSON.stringify(input)).not.toContain("fileBytes");
});

test("confirmDelete sends one typed request and returns confirmed deletion", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const response: ConfirmDeleteResponse = { status: "deleted" };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).confirmDelete(input);

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/delete");
  await expect(backendRequest.clone().json()).resolves.toEqual(input);
  expect(JSON.stringify(input)).not.toContain("fileBytes");
});

test("the root application router registers the wizard router", async () => {
  const response: WorkflowConfig = {
    maxFileSizeBytes: 7_340_032,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  setApplicationBindings();
  const request = new Request(FRONTEND_URL);
  const createApplicationCaller = createCallerFactory(appRouter);

  const result = await createApplicationCaller(
    createTRPCRequestContext(request),
    { signal: request.signal },
  ).wizard.getWorkflowConfig();

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
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
    callerForRequest(request).createUpload(input),
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
    callerForRequest(request).refreshDownloadGrant(input),
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
    callerForRequest(request).dryRun(input),
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

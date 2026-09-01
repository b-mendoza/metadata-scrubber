import { once } from "node:events";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import type {
  CreateUploadInput,
  CreateUploadResponse,
  DryRunInput,
  DryRunResponse,
  WorkflowConfig,
} from "./wizard-router.mod.server";
import {
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  wizardRouter,
  WORKFLOW_MAX_FILE_SIZE_BYTES,
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
const UPLOAD_URL = "https://uploads.test/source.pdf";
const FIRST_FETCH_CALL_INDEX = 0;
const FETCH_INPUT_ARGUMENT_INDEX = 0;
const MINIMUM_FILE_SIZE_BYTES = 1;

const testEnvironment = environmentSchema.parse({
  BACKEND_URL: BACKEND_BASE_URL.href,
});
const createWizardCaller = createCallerFactory(wizardRouter);

type WizardCaller = ReturnType<typeof createWizardCaller>;

const setApplicationBindings = () => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    env: testEnvironment,
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
};

const callerForRequest = (request: Request): WizardCaller => {
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
  const firstFetchCall = fetchMock.mock.calls.at(FIRST_FETCH_CALL_INDEX);
  expect(firstFetchCall).toBeDefined();
  const request = firstFetchCall?.at(FETCH_INPUT_ARGUMENT_INDEX);
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
    maxFileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES,
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
  const input: CreateUploadInput = {
    fileName: "report.pdf",
    fileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES,
  };
  const response: CreateUploadResponse = {
    storageKey: STORAGE_KEY,
    uploadUrl: UPLOAD_URL,
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

test("an unclassified transport failure maps to BAD_GATEWAY without public details", async () => {
  const input: CreateUploadInput = {
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

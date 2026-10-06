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
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

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
import { wizardRouter } from "./wizard-router.mod.server";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";

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
  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
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
  const backendRequests: Request[] = [];
  const responsePromise = Promise.resolve(Response.json(response));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchRequest) => {
      expect.assert(fetchRequest instanceof Request);
      backendRequests.push(fetchRequest.clone());
      return responsePromise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).createUpload(input);

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(typeof backendRequest !== "undefined");
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/uploads");
  await expect(backendRequest.json()).resolves.toEqual(input);
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
  const backendRequests: Request[] = [];
  const responsePromise = Promise.resolve(Response.json(response));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchRequest) => {
      expect.assert(fetchRequest instanceof Request);
      backendRequests.push(fetchRequest.clone());
      return responsePromise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).dryRun(input);

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(typeof backendRequest !== "undefined");
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/dry-run");
  await expect(backendRequest.json()).resolves.toEqual(input);
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
  const backendRequests: Request[] = [];
  const responsePromise = Promise.resolve(Response.json(response));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchRequest) => {
      expect.assert(fetchRequest instanceof Request);
      backendRequests.push(fetchRequest.clone());
      return responsePromise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).scrubFile(input);

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(typeof backendRequest !== "undefined");
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/scrub");
  await expect(backendRequest.json()).resolves.toEqual(input);
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
  const backendRequests: Request[] = [];
  const responsePromise = Promise.resolve(Response.json(response));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchRequest) => {
      expect.assert(fetchRequest instanceof Request);
      backendRequests.push(fetchRequest.clone());
      return responsePromise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).refreshDownloadGrant(input);

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(typeof backendRequest !== "undefined");
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe(
    "https://backend.test/api/files/download-grant",
  );
  await expect(backendRequest.json()).resolves.toEqual(input);
});

test("confirmDelete sends one typed request and returns confirmed deletion", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const response: ConfirmDeleteResponse = { status: "deleted" };
  const backendRequests: Request[] = [];
  const responsePromise = Promise.resolve(Response.json(response));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchRequest) => {
      expect.assert(fetchRequest instanceof Request);
      backendRequests.push(fetchRequest.clone());
      return responsePromise;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).confirmDelete(input);

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(typeof backendRequest !== "undefined");
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/delete");
  await expect(backendRequest.json()).resolves.toEqual(input);
});

test("the root application router registers the wizard router", async () => {
  const response: WorkflowConfig = {
    maxFileSizeBytes: 7_340_032,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  const request = new Request(FRONTEND_URL);
  const createAppCaller = createCallerFactory(appRouter);

  const result = await createAppCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  }).wizard.getWorkflowConfig();

  expect(result).toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
});

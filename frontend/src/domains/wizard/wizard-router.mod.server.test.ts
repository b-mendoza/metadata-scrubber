import { TRPCError } from "@trpc/server";
import ky from "ky";
import { expect, test, vi } from "vitest";

import { CONFLICT_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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
import { CONFIRM_DELETE_FAILURE_MESSAGE } from "./wizard-router.mod.server";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";

const createAppCaller = createCallerFactory(appRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createAppCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  }).wizard;
};

test("getWorkflowConfig requests GET /api/files/config", async () => {
  const response: WorkflowConfig = {
    maxFileSizeBytes: 7_340_032,
  };
  const backendRequests: Request[] = [];
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).getWorkflowConfig();

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
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
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).createUpload(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/uploads");
  await expect(backendRequest.json()).resolves.toEqual(input);
});

test("dryRun sends the storage key", async () => {
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
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).dryRun(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(backendRequest instanceof Request);
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
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).scrubFile(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(backendRequest instanceof Request);
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
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).refreshDownloadGrant(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe(
    "https://backend.test/api/files/download-grant",
  );
  await expect(backendRequest.json()).resolves.toEqual(input);
});

test("confirmDelete sends one typed delete request", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const response: ConfirmDeleteResponse = { status: "deleted" };
  const backendRequests: Request[] = [];
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (fetchInput) => {
      backendRequests.push(new Request(fetchInput).clone());
      const backendResponse = await Promise.resolve(Response.json(response));
      return backendResponse;
    });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).confirmDelete(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [backendRequest] = backendRequests;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/delete");
  await expect(backendRequest.json()).resolves.toEqual(input);
});

test("invalid backend error JSON maps to BAD_GATEWAY without public details", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const providerDetails = "provider-request-id-and-object-key";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(providerDetails, { status: CONFLICT_STATUS_CODE }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  let failure: unknown = null;
  try {
    await callerForRequest(request).confirmDelete(input);
  } catch (error) {
    failure = error;
  }

  expect.assert(failure instanceof TRPCError);
  expect(failure.code).toBe("BAD_GATEWAY");
  expect(failure.message).toBe(CONFIRM_DELETE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

import { once } from "node:events";
// eslint-disable-next-line vitest/no-import-node-test -- Node mocks control native promise timers that Vitest leaves on the real clock.
import { mock } from "node:test";
import timers from "node:timers/promises";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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

import type { BackendErrorResponse } from "./wizard-contracts.mod.server";
import {
  CONFIRM_DELETE_FAILURE_MESSAGE,
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  SCRUB_FILE_FAILURE_MESSAGE,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
} from "./wizard-router.mod.server";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";
const MINIMUM_FILE_SIZE_BYTES = 1;
const SERVER_RETRY_DELAY_MS = 1000;
const CLIENT_RETRY_DELAY_MS = 150;
const HALF_JITTER_SAMPLE = 0.5;
const ONE_MILLISECOND_MS = 1;
const TWO_FETCH_ATTEMPTS = 2;
const EXPECTED_DRY_RUN_TIMEOUT_MS = 90_000;
const EXPECTED_SCRUB_TIMEOUT_MS = 240_000;
const TWO_BYTE_FILE_NAME_CHARACTER = "é";
const ACCEPTED_TWO_BYTE_CHARACTER_COUNT = 127;

const createAppCaller = createCallerFactory(appRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createAppCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  }).wizard;
};

test("getWorkflowConfig requests GET /api/files/config", async () => {
  const response: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 7_340_032,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).getWorkflowConfig();

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("GET");
  expect(backendRequest.url).toBe("https://backend.test/api/files/config");
});

test("createUpload sends only its typed small-JSON contract", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: `${TWO_BYTE_FILE_NAME_CHARACTER.repeat(ACCEPTED_TWO_BYTE_CHARACTER_COUNT)}a`,
    fileSizeBytes: 10_485_761,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: STORAGE_KEY,
    uploadUrl: "https://uploads.test/source.pdf",
  };
  const backendBodies: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (fetchInput) => {
    backendBodies.push(await new Request(fetchInput).json());
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).createUpload(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/uploads");
  const [backendBody] = backendBodies;
  expect(backendBody).toEqual(input);
});

test("dryRun sends the storage key", async () => {
  const input: RouterInputs["wizard"]["dryRun"] = { storageKey: STORAGE_KEY };
  const response: RouterOutputs["wizard"]["dryRun"] = {
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
  const backendBodies: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (fetchInput) => {
    backendBodies.push(await new Request(fetchInput).json());
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).dryRun(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/dry-run");
  const [backendBody] = backendBodies;
  expect(backendBody).toEqual(input);
});

test("scrubFile forwards the exact reviewed ETag without file bytes", async () => {
  const input: RouterInputs["wizard"]["scrubFile"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: RouterOutputs["wizard"]["scrubFile"] = {
    result: { downloadUrl: DOWNLOAD_URL },
    status: "done",
  };
  const backendBodies: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (fetchInput) => {
    backendBodies.push(await new Request(fetchInput).json());
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).scrubFile(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/scrub");
  const [backendBody] = backendBodies;
  expect(backendBody).toEqual(input);
});

test("refreshDownloadGrant targets one exact sanitized revision", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: DOWNLOAD_URL,
    expiresAt: "2026-09-01T12:15:00Z",
  };
  const backendBodies: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (fetchInput) => {
    backendBodies.push(await new Request(fetchInput).json());
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).refreshDownloadGrant(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe(
    "https://backend.test/api/files/download-grant",
  );
  const [backendBody] = backendBodies;
  expect(backendBody).toEqual(input);
});

test("confirmDelete sends one typed delete request", async () => {
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: STORAGE_KEY,
  };
  const response: RouterOutputs["wizard"]["confirmDelete"] = {
    status: "deleted",
  };
  const backendBodies: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (fetchInput) => {
    backendBodies.push(await new Request(fetchInput).json());
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  await callerForRequest(request).confirmDelete(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[backendRequest] = []] = fetchMock.mock.calls;
  expect.assert(backendRequest instanceof Request);
  expect(backendRequest.method).toBe("POST");
  expect(backendRequest.url).toBe("https://backend.test/api/files/delete");
  const [backendBody] = backendBodies;
  expect(backendBody).toEqual(input);
});

beforeEach(() => {
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});

afterEach(() => {
  mock.timers.reset();
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
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("dryRun uses its total timeout after a server-directed retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  vi.spyOn(Math, "random").mockReturnValue(HALF_JITTER_SAMPLE);
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

  await timers.setImmediate();
  mock.timers.tick(CLIENT_RETRY_DELAY_MS);
  await timers.setImmediate();
  mock.timers.tick(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledOnce();

  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);

  mock.timers.tick(
    EXPECTED_DRY_RUN_TIMEOUT_MS - Date.now() - ONE_MILLISECOND_MS,
  );
  await timers.setImmediate();
  expect(settle).not.toHaveBeenCalled();

  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(settle).toHaveBeenCalledOnce();
  const [[error] = []] = settle.mock.calls;
  expect.assert(error instanceof TRPCError);
  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("scrubFile uses its total timeout after a server-directed retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  vi.spyOn(Math, "random").mockReturnValue(HALF_JITTER_SAMPLE);
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

  await timers.setImmediate();
  mock.timers.tick(CLIENT_RETRY_DELAY_MS);
  await timers.setImmediate();
  mock.timers.tick(SERVER_RETRY_DELAY_MS - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledOnce();

  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);

  mock.timers.tick(EXPECTED_SCRUB_TIMEOUT_MS - Date.now() - ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(settle).not.toHaveBeenCalled();

  mock.timers.tick(ONE_MILLISECOND_MS);
  await timers.setImmediate();
  expect(settle).toHaveBeenCalledOnce();
  const [[error] = []] = settle.mock.calls;
  expect.assert(error instanceof TRPCError);
  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(SCRUB_FILE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("getWorkflowConfig rejects a backend 503 without a retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
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

  const operation = callerForRequest(request).getWorkflowConfig();
  void operation.catch(() => null);
  await timers.setImmediate();
  mock.timers.runAll();

  await expect(operation).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: WORKFLOW_CONFIG_FAILURE_MESSAGE,
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("createUpload rejects a backend 503 without a retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: MINIMUM_FILE_SIZE_BYTES,
  };
  const response: BackendErrorResponse = { error: "processing busy" };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const operation = callerForRequest(request).createUpload(input);
  void operation.catch(() => null);
  await timers.setImmediate();
  mock.timers.runAll();

  await expect(operation).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: CREATE_UPLOAD_FAILURE_MESSAGE,
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("refreshDownloadGrant rejects a backend 503 without a retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: BackendErrorResponse = { error: "processing busy" };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const operation = callerForRequest(request).refreshDownloadGrant(input);
  void operation.catch(() => null);
  await timers.setImmediate();
  mock.timers.runAll();

  await expect(operation).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("confirmDelete rejects a backend 503 without a retry", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: STORAGE_KEY,
  };
  const response: BackendErrorResponse = { error: "processing busy" };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(response, {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const operation = callerForRequest(request).confirmDelete(input);
  void operation.catch(() => null);
  await timers.setImmediate();
  mock.timers.runAll();

  await expect(operation).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: CONFIRM_DELETE_FAILURE_MESSAGE,
  });
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

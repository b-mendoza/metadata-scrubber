import { afterEach, expect, test, vi } from "vitest";

import {
  BAD_REQUEST_STATUS_CODE,
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  PAYLOAD_TOO_LARGE_STATUS_CODE,
  REQUEST_TIMEOUT_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  UNPROCESSABLE_ENTITY_STATUS_CODE,
  UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";
import { WORKFLOW_RETRY_LIMIT } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";

import type {
  BackendErrorResponse,
  ConfirmDeleteInput,
  DryRunInput,
  RefreshDownloadGrantInput,
  ScrubFileInput,
} from "./wizard-contracts.mod.server";
import {
  CONFIRM_DELETE_FAILURE_MESSAGE,
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  SCRUB_FILE_FAILURE_MESSAGE,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
} from "./wizard-router.mod.server";
import {
  callerForRequest,
  requireTRPCError,
} from "./wizard-router.test-helper";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const INITIAL_FETCH_ATTEMPT_COUNT = 1;
const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";
const ONE_BYTE = 1;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("getWorkflowConfig rejects a malformed backend config body", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ maxFileSizeBytes: "big" }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).getWorkflowConfig(),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(WORKFLOW_CONFIG_FAILURE_MESSAGE);
});

test("createUpload rejects an invalid backend upload URL", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: ONE_BYTE,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ storageKey: STORAGE_KEY, uploadUrl: "not-a-url" }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
});

test("createUpload maps an oversize backend response to PAYLOAD_TOO_LARGE", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 10_485_761,
  };
  const response: BackendErrorResponse = {
    error: "source file exceeds 10 MiB limit",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(response, { status: PAYLOAD_TOO_LARGE_STATUS_CODE }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );

  expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
  expect(error.message).not.toContain(response.error);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("dryRun rejects an invalid backend ETag", async () => {
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ etag: `"${CANONICAL_ETAG}"`, fields: [] }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).dryRun(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
});

test("scrubFile rejects an invalid backend success payload", async () => {
  const input: ScrubFileInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      result: { downloadUrl: "not-a-url" },
      status: "done",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).scrubFile(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(SCRUB_FILE_FAILURE_MESSAGE);
});

test("refreshDownloadGrant rejects an invalid backend timestamp", async () => {
  const input: RefreshDownloadGrantInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ downloadUrl: DOWNLOAD_URL, expiresAt: "tomorrow" }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).refreshDownloadGrant(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE);
});

test("confirmDelete rejects an unconfirmed backend success payload", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ status: "pending" }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).confirmDelete(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CONFIRM_DELETE_FAILURE_MESSAGE);
});

test.each([
  [BAD_REQUEST_STATUS_CODE, "BAD_REQUEST"],
  [NOT_FOUND_STATUS_CODE, "NOT_FOUND"],
  [REQUEST_TIMEOUT_STATUS_CODE, "TIMEOUT"],
  [CONFLICT_STATUS_CODE, "CONFLICT"],
  [PAYLOAD_TOO_LARGE_STATUS_CODE, "PAYLOAD_TOO_LARGE"],
  [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE, "UNSUPPORTED_MEDIA_TYPE"],
  [UNPROCESSABLE_ENTITY_STATUS_CODE, "UNPROCESSABLE_CONTENT"],
  [SERVICE_UNAVAILABLE_STATUS_CODE, "SERVICE_UNAVAILABLE"],
] as const)("dryRun maps backend HTTP %i to %s", async (status, code) => {
  vi.useFakeTimers();
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const response: BackendErrorResponse = {
    error: "safe backend error",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response, { status }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const errorPromise = requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).dryRun(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;
  vi.useRealTimers();

  expect(error.code).toBe(code);
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(error.message).not.toContain("safe backend error");
  expect(fetchMock).toHaveBeenCalledTimes(
    status === SERVICE_UNAVAILABLE_STATUS_CODE
      ? WORKFLOW_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT
      : INITIAL_FETCH_ATTEMPT_COUNT,
  );
});

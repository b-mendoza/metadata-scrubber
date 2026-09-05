import { TRPCError } from "@trpc/server";
import ky from "ky";
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
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

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
  wizardRouter,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
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
const ONE_BYTE = 1;

const createWizardCaller = createCallerFactory(wizardRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
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
    callerForRequest(request).getWorkflowConfig(),
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
    callerForRequest(request).createUpload(input),
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
    callerForRequest(request).createUpload(input),
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

  const error = await requireTRPCError(callerForRequest(request).dryRun(input));

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
    callerForRequest(request).scrubFile(input),
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
    callerForRequest(request).refreshDownloadGrant(input),
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
    callerForRequest(request).confirmDelete(input),
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
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const response: BackendErrorResponse = {
    error: "safe backend error",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response, { status }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(callerForRequest(request).dryRun(input));

  expect(error.code).toBe(code);
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(error.message).not.toContain("safe backend error");
  expect(fetchMock).toHaveBeenCalledOnce();
});

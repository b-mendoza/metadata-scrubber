import { afterEach, expect, test, vi } from "vitest";

import {
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";

import type {
  BackendErrorResponse,
  ConfirmDeleteInput,
  RefreshDownloadGrantInput,
  ScrubFileInput,
  ScrubFileResponse,
} from "./wizard-contracts.mod.server";
import {
  CONFIRM_DELETE_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  SCRUB_FILE_FAILURE_MESSAGE,
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
const TWO_FETCH_ATTEMPTS = 2;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("scrubFile keeps missing source and revision conflict results distinct", async () => {
  const input: ScrubFileInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const missingResponse: BackendErrorResponse = {
    error: "source file not found",
  };
  const conflictResponse: BackendErrorResponse = {
    error: "source file changed since review",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(missingResponse, { status: NOT_FOUND_STATUS_CODE }),
    )
    .mockResolvedValueOnce(
      Response.json(conflictResponse, { status: CONFLICT_STATUS_CODE }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const caller = callerForRequest(request, BACKEND_BASE_URL);

  const missingError = await requireTRPCError(caller.scrubFile(input));
  const conflictError = await requireTRPCError(caller.scrubFile(input));

  expect(missingError.code).toBe("NOT_FOUND");
  expect(conflictError.code).toBe("CONFLICT");
  expect(missingError.message).toBe(SCRUB_FILE_FAILURE_MESSAGE);
  expect(conflictError.message).toBe(SCRUB_FILE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("duplicate scrub success returns a fresh normal done response", async () => {
  const input: ScrubFileInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const firstResponse: ScrubFileResponse = {
    result: { downloadUrl: "https://downloads.test/first.pdf" },
    status: "done",
  };
  const secondResponse: ScrubFileResponse = {
    result: { downloadUrl: "https://downloads.test/second.pdf" },
    status: "done",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(firstResponse))
    .mockResolvedValueOnce(Response.json(secondResponse));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);
  const caller = callerForRequest(request, BACKEND_BASE_URL);

  await expect(caller.scrubFile(input)).resolves.toEqual(firstResponse);
  await expect(caller.scrubFile(input)).resolves.toEqual(secondResponse);
  expect(fetchMock).toHaveBeenCalledTimes(TWO_FETCH_ATTEMPTS);
});

test("refreshDownloadGrant maps a missing revision to NOT_FOUND", async () => {
  const input: RefreshDownloadGrantInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const response: BackendErrorResponse = {
    error: "scrubbed file not found",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(response, { status: NOT_FOUND_STATUS_CODE }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).refreshDownloadGrant(input),
  );

  expect(error.code).toBe("NOT_FOUND");
  expect(error.message).toBe(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("confirmDelete maps unconfirmed deletion to CONFLICT", async () => {
  const input: ConfirmDeleteInput = { storageKey: STORAGE_KEY };
  const response: BackendErrorResponse = {
    error: "file deletion could not be confirmed",
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(response, { status: CONFLICT_STATUS_CODE }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).confirmDelete(input),
  );

  expect(error.code).toBe("CONFLICT");
  expect(error.message).toBe(CONFIRM_DELETE_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
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

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).confirmDelete(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CONFIRM_DELETE_FAILURE_MESSAGE);
  expect(error.message).not.toContain(providerDetails);
  expect(fetchMock).toHaveBeenCalledOnce();
});

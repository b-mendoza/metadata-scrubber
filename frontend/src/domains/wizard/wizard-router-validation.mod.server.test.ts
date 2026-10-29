import ky from "ky";
import type { HttpResponseResolver } from "msw";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { scrubFileInputSchema } from "#/domains/wizard/wizard-contracts.mod.server";
import {
  CONFIRM_DELETE_FAILURE_MESSAGE,
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  SCRUB_FILE_FAILURE_MESSAGE,
  wizardRouter,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
} from "#/domains/wizard/wizard-router.mod.server";
import {
  BAD_GATEWAY_STATUS_CODE,
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
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const DOWNLOAD_URL = "https://downloads.test/sanitized.pdf";
const ONE_BYTE = 1;
const TWO_BYTE_FILE_NAME_CHARACTER = "é";
const REJECTED_TWO_BYTE_CHARACTER_COUNT = 128;

const createWizardCaller = createCallerFactory(wizardRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

test.each([
  ["weak", `W/"${CANONICAL_ETAG}"`],
  ["quoted", `"${CANONICAL_ETAG}"`],
  ["too short", "0123456789abcdef0123456789abcde"],
  ["too long", `${CANONICAL_ETAG}0`],
  ["upper case", CANONICAL_ETAG.toUpperCase()],
  ["non-hex", "0123456789abcdef0123456789abcdeg"],
  ["multipart", `${CANONICAL_ETAG}-2`],
  ["leading space", ` ${CANONICAL_ETAG}`],
  ["trailing space", `${CANONICAL_ETAG} `],
])("scrubFile rejects %s ETag before fetch", async (_caseName, etag) => {
  const input: RouterInputs["wizard"]["scrubFile"] = {
    etag,
    storageKey: STORAGE_KEY,
  };
  const handler = vi.fn<HttpResponseResolver>(() => HttpResponse.error());
  server.use(http.all("*", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).scrubFile(input),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(handler).not.toHaveBeenCalled();
});

test.each([
  ["path traversal", "../report.pdf"],
  ["leading white space", " report.pdf"],
  ["trailing white space", "report.pdf "],
  ["blank", " "],
  ["backslash", String.raw`report\.pdf`],
  ["ASCII control U+0001", "report\u{0001}.pdf"],
  ["DEL U+007F", "report\u{007F}.pdf"],
  ["U+FFFD", "report\u{FFFD}.pdf"],
  [
    "256-byte UTF-8 name",
    TWO_BYTE_FILE_NAME_CHARACTER.repeat(REJECTED_TWO_BYTE_CHARACTER_COUNT),
  ],
])("createUpload rejects %s before fetch", async (_caseName, fileName) => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName,
    fileSizeBytes: ONE_BYTE,
  };
  const handler = vi.fn<HttpResponseResolver>(() => HttpResponse.error());
  server.use(http.all("*", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).createUpload(input),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(handler).not.toHaveBeenCalled();
});

test("dryRun rejects an invalid storage key before fetch", async () => {
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "source/not-public",
  };
  const handler = vi.fn<HttpResponseResolver>(() => HttpResponse.error());
  server.use(http.all("*", handler));
  const request = new Request(FRONTEND_URL);

  await expect(callerForRequest(request).dryRun(input)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(handler).not.toHaveBeenCalled();
});

test("the scrub input schema rejects a missing ETag", () => {
  const result = scrubFileInputSchema.safeParse({ storageKey: STORAGE_KEY });

  expect(result.success).toBe(false);
});

test("refreshDownloadGrant rejects an invalid ETag before fetch", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    etag: `"${CANONICAL_ETAG}"`,
    storageKey: STORAGE_KEY,
  };
  const handler = vi.fn<HttpResponseResolver>(() => HttpResponse.error());
  server.use(http.all("*", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).refreshDownloadGrant(input),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(handler).not.toHaveBeenCalled();
});

test("confirmDelete rejects an invalid storage key before fetch", async () => {
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: "uploads/not-a-uuid",
  };
  const handler = vi.fn<HttpResponseResolver>(() => HttpResponse.error());
  server.use(http.all("*", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).confirmDelete(input),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(handler).not.toHaveBeenCalled();
});

test("getWorkflowConfig rejects a malformed backend config body", async () => {
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({ maxFileSizeBytes: "big" }),
  );
  server.use(http.get("https://backend.test/api/files/config", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).getWorkflowConfig(),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: WORKFLOW_CONFIG_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("createUpload rejects an invalid backend upload URL", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: ONE_BYTE,
  };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({ storageKey: STORAGE_KEY, uploadUrl: "not-a-url" }),
  );
  server.use(http.post("https://backend.test/api/uploads", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).createUpload(input),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: CREATE_UPLOAD_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("dryRun rejects an invalid backend ETag", async () => {
  const input: RouterInputs["wizard"]["dryRun"] = { storageKey: STORAGE_KEY };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({ etag: `"${CANONICAL_ETAG}"`, fields: [] }),
  );
  server.use(http.post("https://backend.test/api/files/dry-run", handler));
  const request = new Request(FRONTEND_URL);

  await expect(callerForRequest(request).dryRun(input)).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: DRY_RUN_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("scrubFile rejects an invalid backend success payload", async () => {
  const input: RouterInputs["wizard"]["scrubFile"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({
      result: { downloadUrl: "not-a-url" },
      status: "done",
    }),
  );
  server.use(http.post("https://backend.test/api/files/scrub", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).scrubFile(input),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: SCRUB_FILE_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("refreshDownloadGrant rejects an invalid backend timestamp", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({ downloadUrl: DOWNLOAD_URL, expiresAt: "tomorrow" }),
  );
  server.use(
    http.post("https://backend.test/api/files/download-grant", handler),
  );
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).refreshDownloadGrant(input),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("confirmDelete rejects an unconfirmed backend success payload", async () => {
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: STORAGE_KEY,
  };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json({ status: "pending" }),
  );
  server.use(http.post("https://backend.test/api/files/delete", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).confirmDelete(input),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: CONFIRM_DELETE_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test.each([
  { status: BAD_REQUEST_STATUS_CODE, code: "BAD_REQUEST" },
  { status: NOT_FOUND_STATUS_CODE, code: "NOT_FOUND" },
  { status: REQUEST_TIMEOUT_STATUS_CODE, code: "TIMEOUT" },
  { status: CONFLICT_STATUS_CODE, code: "CONFLICT" },
  { status: PAYLOAD_TOO_LARGE_STATUS_CODE, code: "PAYLOAD_TOO_LARGE" },
  {
    status: UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
    code: "UNSUPPORTED_MEDIA_TYPE",
  },
  { status: UNPROCESSABLE_ENTITY_STATUS_CODE, code: "UNPROCESSABLE_CONTENT" },
  { status: SERVICE_UNAVAILABLE_STATUS_CODE, code: "SERVICE_UNAVAILABLE" },
  { status: BAD_GATEWAY_STATUS_CODE, code: "BAD_GATEWAY" },
])("dryRun maps backend HTTP $status to $code", async ({ status, code }) => {
  const input: RouterInputs["wizard"]["dryRun"] = { storageKey: STORAGE_KEY };
  const response: BackendErrorResponse = {
    error: "safe backend error",
  };
  const handler = vi.fn<HttpResponseResolver>(() =>
    HttpResponse.json(response, { status }),
  );
  server.use(http.post("https://backend.test/api/files/dry-run", handler));
  const request = new Request(FRONTEND_URL);

  await expect(callerForRequest(request).dryRun(input)).rejects.toMatchObject({
    code,
    message: DRY_RUN_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("a non-contract backend error body maps to BAD_GATEWAY without public details", async () => {
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: STORAGE_KEY,
  };
  const providerDetails = "provider-request-id-and-object-key";
  const handler = vi.fn<HttpResponseResolver>(
    () => new HttpResponse(providerDetails, { status: CONFLICT_STATUS_CODE }),
  );
  server.use(http.post("https://backend.test/api/files/delete", handler));
  const request = new Request(FRONTEND_URL);

  await expect(
    callerForRequest(request).confirmDelete(input),
  ).rejects.toMatchObject({
    code: "BAD_GATEWAY",
    message: CONFIRM_DELETE_FAILURE_MESSAGE,
  });
  expect(handler).toHaveBeenCalledOnce();
});
